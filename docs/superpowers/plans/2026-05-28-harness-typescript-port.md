# Plan d'implémentation — Port TypeScript du harness V1

> **Exécution** : ce plan est exécuté via le **Workflow tool** (orchestration multi-agents),
> conformément à la demande utilisateur. Spec de référence :
> `docs/superpowers/specs/2026-05-28-harness-typescript-port-design.md`.

**Goal :** Porter fidèlement l'orchestrateur Python V1 en TypeScript, comportement identique.

**Architecture :** Miroir 1:1 des modules Python. Le SDK Python est remplacé par
`@anthropic-ai/claude-agent-sdk`. La plomberie SDK est réimplémentée idiomatiquement (Runner-A :
prompt string + watchdog `AbortController`).

**Tech Stack :** Node + TypeScript strict, `tsx`, `tsc`, `vitest`, `pnpm`, `yaml`, `zod`.

---

## DAG de dépendances (ordre d'exécution)

```
Phase 0 (inline)  : scaffold + src/types.ts + pnpm install
Phase 1 (parallèle): progress.ts | security.ts | tools.ts | agents/client.ts   (+ tests)
Phase 2 (parallèle): agents/planner.ts | agents/builder.ts | agents/evaluator.ts
Phase 3           : orchestrator.ts + index.ts
Phase 4           : vérification (tsc --noEmit, vitest run)
Phase 5           : archivage Python → legacy-python/
```

Justification des barrières : Phase 2 dépend de `client/security/tools` (types & fonctions importées) ;
Phase 3 dépend de tout. Ce sont de vraies dépendances → barrières justifiées.

## Contrat d'interfaces (figé dans `src/types.ts` + signatures par module)

### `src/types.ts`
- `Config` : miroir exact de `config.yaml` (clés snake_case : `project`, `models`, `stack`,
  `orchestration`, `budget`, `agent_limits.{planner,builder,evaluator}` de type `AgentLimits`,
  `qa`, `security`).
- `AgentLimits { max_turns: number; permission_mode: string; allowed_tools: string[] }`.
- Artefacts (compile-time only) : `ProductSpec`, `FeatureListItem`, `SprintContract`,
  `ContractReview`, `QaReport` (champs souples, `[k: string]: unknown` toléré).

### `src/progress.ts` (← `progress.py`)
- `interface AgentRun { agent; phase; cost_usd; duration_ms; num_turns; success; timestamp }`
  (**snake_case** pour JSON identique à V1 ; `timestamp` = ISO 8601 UTC).
- `class ProjectProgress { project_name; runs: AgentRun[]; current_sprint; failed_sprints: number[];
  total_cost_usd; addRun(run); isOverBudget(maxUsd): boolean; sprintCost(n): number;
  save(workspaceDir): void; static load(workspaceDir): ProjectProgress }`.
- `appendProgressLog(workspaceDir, message): void` → `claude-progress.txt`, ligne
  `[YYYY-MM-DD HH:MM:SS UTC] message`.
- `save` écrit `{ project_name, runs, current_sprint, failed_sprints, total_cost_usd }` (indent 2).

### `src/security.ts` (← `security.py`)
- `createPermissionHandler(config: Config, workspaceDir: string): CanUseTool`.
- Helpers : `splitSegments` (regex `&&|\|\||;|\||\n`), `segmentBinary` (gère `ENV=x bin`),
  `extractPaths`, `isInside(path, root)`.
- Logique `validateBash` identique : denylist (escape regex), allowlist par segment, confinement de
  chemins (tokens ressemblant à un path), suivi du `cd` (refus `cd` nu, MAJ `effectiveCwd`).
- Confinement Read/Write/Edit (`file_path`) et Glob/Grep (`path`).
- Retour : `{ behavior: "deny", message }` ou `{ behavior: "allow" }`.
- Parsing shell : utiliser `shell-quote` (parse) ou un `shlex` minimal interne pour `segmentBinary`/
  `extractPaths`/tokens du `cd`. **Décision : implémenter un `shlexSplit` interne** (pas de dép
  supplémentaire) reproduisant `shlex.split` pour les cas usuels (espaces, quotes simples/doubles).

### `src/tools.ts` (← `tools.py`)
- `REQUIRED_KEYS` identique.
- `createHarnessTools(workspaceDir): McpSdkServerConfigWithInstance` via `createSdkMcpServer` +
  `tool()`. Schémas params en **zod** : `update_progress({ phase: z.string(), message: z.string() })`,
  `validate_json({ file_path: z.string(), schema_name: z.enum([...keys, "feature_list"]) })`.
- Handlers : logique identique ; retour `{ content: [{ type: "text", text }], isError? }`.

### `src/agents/client.ts` (← `agents/client.py`)
- `interface AgentResult { textOutput; costUsd; durationMs; numTurns; isError; sessionId; resultText: string|null }`.
- `runAgent(prompt: string, options: Options): Promise<AgentResult>` (Options = type du SDK).
- Runner-A : `query({ prompt, options: { ...options, settingSources: [], strictMcpConfig: true,
  abortController, stderr: writeToDebugLog } })`. Watchdog idle 120 s via `setInterval(5 s)` +
  `lastActivity` → `abortController.abort()`. `switch(msg.type)` : `assistant` → accumuler blocs
  `text` ; `result` → capturer coût/turns/durée ; `default: continue` (jamais de throw). Pas de
  `result` ⇒ `isError:true, costUsd:0`. stderr → `cli_debug.log` (append, header horodaté).

### `src/agents/{planner,builder,evaluator}.ts`
- `PROMPTS_DIR` = `path.resolve(fileURLToPath(import.meta.url), "../../../prompts")`.
- `runPlanner(userPrompt, config, workspaceDir): Promise<AgentResult>` — prompt utilisateur **verbatim**
  du Python ; options : systemPrompt = `planner_prompt.md`.
- `runBuilderContract(sprintNum, config, workspaceDir, evaluatorFeedback?)` /
  `runBuilderImplement(sprintNum, config, workspaceDir, qaFeedback?)` — systemPrompt =
  `builder_prompt.md` + `"\n\n---\n\n"` + `grading_criteria.md`.
- `runEvaluatorReviewContract(sprintNum, config, workspaceDir)` (sans Playwright) /
  `runEvaluatorQa(sprintNum, config, workspaceDir)` (avec Playwright si `qa.tools.playwright`,
  `mcp__playwright__*` ajouté ; `sprintNum===0` ⇒ `qa_report_final.json` + scope final). Prompts
  utilisateur **verbatim** du Python.

### `src/orchestrator.ts` + `src/index.ts` (← `orchestrator.py`)
- `loadConfig(path)` (parse YAML), `readJson(workspace, filename)`, `cleanupWorkspacePorts(workspace)`
  (`lsof -tiTCP -sTCP:LISTEN -i:3000,3001,8000,8001` → kill SIGTERM si cwd ∈ workspace via
  `/proc/<pid>/cwd`), `phasePlanning`, `negotiateContract`, `runSprint`, `phaseSprints`,
  `phaseFinalEvaluation`, `main(userPrompt, projectName)`. Logique de flux **identique** (skip si
  artefacts déjà présents, budget check, abort sur `failed_sprints`, `finally` cleanup).
- `index.ts` : `process.argv` → `main` ; `try/catch` global ; usage si pas d'argument.

## Tests (vitest) — par module porté
- `progress.test.ts` : `addRun`/total, `isOverBudget`, `sprintCost`, round-trip save/load snake_case.
- `security.test.ts` : allowlist OK/KO, denylist, `cd ../autre && npm i` refusé, `cd` nu refusé,
  path absolu hors workspace refusé, Read hors workspace refusé.
- `tools.test.ts` : `validate_json` clés présentes/manquantes, `feature_list` tableau, schéma inconnu.
- `orchestrator-scoring.test.ts` : verdict PASS si `verdict==="PASS" && score>=min_score_global`,
  FAIL sinon.

## Vérification finale
`pnpm install` (phase 0) · `pnpm typecheck` (= `tsc --noEmit`) **vert** · `pnpm test` **vert**.

## Limites V1 conservées (ne PAS corriger)
`progress.json` en fin de sprint seulement · `cost_usd=0` au crash · pas de reprise/state machine ·
pas de Docker · `failed_sprints` ⇒ abort.
