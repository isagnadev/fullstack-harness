# Spec — Port fidèle du harness V1 (Python → TypeScript)

| | |
|---|---|
| **Date** | 2026-05-28 |
| **Type** | Migration / port 1:1 |
| **Statut** | Approuvé — prêt pour le plan d'implémentation |
| **Périmètre** | Traduction fidèle du code Python V1 en TypeScript, comportement observable identique |

---

## 1. Objectif

Migrer l'orchestrateur multi-agents existant (Python, `claude-code-sdk`) vers TypeScript
(`@anthropic-ai/claude-agent-sdk`), en **conservant toutes les mécaniques de la V1**. Le résultat
doit se comporter de façon observable comme la V1 : mêmes agents, même protocole de fichiers JSON,
même boucle d'orchestration, même scoring, même modèle de sécurité.

## 2. Décisions cadrées (validées avec l'utilisateur)

1. **Port fidèle 1:1** — pas l'évolution décrite dans `V2_SPEC_CONSOLIDATED.md`. Ce document V2
   (Docker/DinD, state machine, reprise, quality gate…) est **explicitement hors périmètre**.
2. **Remplacer en place** — le code Python est archivé dans `legacy-python/`, le TypeScript devient
   le projet. `config.yaml` et `prompts/` restent partagés à la racine, **inchangés**.
3. **Tooling** — `pnpm` + `tsx` (exécution) + `tsc` (typecheck) + `vitest` (tests).
4. **Runner-A** — prompt `string` + watchdog idle via `AbortController` (cf. §8). Le mode streaming
   du SDK Python n'est pas requis par le SDK TS pour `canUseTool`.

## 3. Non-objectifs (limites V1 conservées volontairement)

Aucun correctif V2 n'est introduit. On reproduit fidèlement, **y compris les limites connues** :

- `progress.json` n'est sauvegardé qu'**en fin de sprint** (pas de persistance granulaire).
- `cost_usd = 0` quand un agent crash sans émettre de `ResultMessage` (pas d'estimation fallback).
- Pas de reprise / state machine / Docker / health check / quality gate shell.
- `failed_sprints` non vide → abort de tout le pipeline (l'utilisateur doit éditer `progress.json`).

## 4. SDK TypeScript — API vérifiée (doc officielle, mai 2026)

Source : `https://code.claude.com/docs/en/agent-sdk/typescript`.

- **Package** : `@anthropic-ai/claude-agent-sdk`. Wrappe toujours le CLI `claude` → CLI installé +
  `ANTHROPIC_API_KEY` ou session active (prérequis identique au Python).
- **`query({ prompt, options }): Query`** — `prompt: string | AsyncIterable<SDKUserMessage>`.
  `Query extends AsyncGenerator<SDKMessage, void>` et expose `interrupt(): Promise<void>`
  (uniquement en mode streaming-input).
- **`canUseTool` fonctionne dans tous les modes** (pas besoin de streaming, contrairement au SDK
  Python). Signature :
  ```ts
  type CanUseTool = (
    toolName: string,
    input: Record<string, unknown>,
    options: { signal: AbortSignal; toolUseID: string; /* … */ }
  ) => Promise<PermissionResult>;

  type PermissionResult =
    | { behavior: "allow"; updatedInput?: Record<string, unknown> }
    | { behavior: "deny"; message: string; interrupt?: boolean };
  ```
- **`Options`** (champs utilisés par le port) :
  `model`, `systemPrompt` (string brute acceptée → on garde nos prompts), `cwd`, `maxTurns`,
  `allowedTools: string[]`, `permissionMode: 'acceptEdits'`, `canUseTool`, `mcpServers`,
  `settingSources: []` + `strictMcpConfig: true` (isolation des MCP globaux `~/.claude`),
  `abortController`, `stderr?: (data) => void`, `env`.
- **MCP in-process** :
  ```ts
  createSdkMcpServer({ name: string; version?: string; tools: SdkMcpToolDefinition[] })
  tool(name, description, zodInputSchema, async (args) => ({ content: [{ type: "text", text }] }))
  ```
  `zod` est requis **uniquement** pour le schéma des params d'outil (exigence SDK), pas pour valider
  les artefacts. Référencement dans `allowedTools` : `mcp__<server>__<tool>`.
- **MCP stdio externe (Playwright)** :
  `{ type: "stdio", command: "npx", args: ["@playwright/mcp", "--headless"] }`
  (nom de package `@playwright/mcp` — confirmé par les leçons V1, pas `@modelcontextprotocol/...`).
- **Message `result`** (`type: "result"`) : `subtype: "success" | "error_max_turns" |
  "error_during_execution" | …`, `total_cost_usd`, `num_turns`, `duration_ms`, `is_error`,
  `session_id`, `result` (texte final), `usage`.
- **Texte assistant** : itérer `msg.message.content` et lire les blocs `type === "text"`.
- **Robustesse** : `switch(msg.type)` avec `default: continue` (jamais de throw sur type inconnu —
  reproduit l'intention du monkey-patch V1 §1.2).

## 5. Structure cible

```
fullstack-harness/
├── config.yaml              # INCHANGÉ (partagé, racine)
├── prompts/                 # INCHANGÉS (planner/builder/evaluator_prompt.md, grading_criteria.md)
├── legacy-python/           # ancien code Python (archivé)
├── package.json             # type:module, scripts pnpm
├── tsconfig.json            # strict, moduleResolution bundler/node, target ES2022
├── vitest.config.ts
├── src/
│   ├── index.ts             # CLI : argv → main(prompt, projectName)
│   ├── orchestrator.ts
│   ├── progress.ts
│   ├── security.ts
│   ├── tools.ts
│   ├── types.ts
│   └── agents/
│       ├── client.ts
│       ├── planner.ts
│       ├── builder.ts
│       └── evaluator.ts
└── tests/
    ├── security.test.ts
    ├── tools.test.ts
    ├── progress.test.ts
    └── orchestrator-scoring.test.ts
```

## 6. Mapping module par module (Python → TypeScript)

### 6.1 `src/types.ts` (nouveau — interfaces compile-time, pas de validation runtime)

Interfaces TS pour : `Config` (miroir de `config.yaml`), `ProductSpec`, `FeatureListItem`,
`SprintContract`, `ContractReview`, `QaReport`, `AgentRunData`. Servent au typage statique ;
**la validation runtime reste les clés requises de `tools.ts`** (cf. §6.5).

### 6.2 `src/progress.ts` (← `progress.py`)

```ts
export interface AgentRun {
  agent: string; phase: string; costUsd: number; durationMs: number;
  numTurns: number; success: boolean; timestamp: string; // ISO 8601 UTC
}
export class ProjectProgress {
  projectName: string; runs: AgentRun[]; currentSprint: number;
  failedSprints: number[]; totalCostUsd: number;
  addRun(run: AgentRun): void;          // accumule totalCostUsd
  isOverBudget(maxUsd: number): boolean;
  sprintCost(sprintNum: number): number; // somme des runs dont phase contient `sprint_<n>`
  save(workspaceDir: string): void;       // écrit progress.json
  static load(workspaceDir: string): ProjectProgress;
}
export function appendProgressLog(workspaceDir: string, message: string): void;
```
Sérialisation JSON : **conserver les noms de champs V1 en snake_case** (`cost_usd`, `duration_ms`,
`num_turns`, `project_name`, `current_sprint`, `failed_sprints`, `total_cost_usd`) pour compat
fichier. Mapping camelCase ↔ snake_case au (de)sérialisé.

### 6.3 `src/security.ts` (← `security.py`)

```ts
export function createPermissionHandler(config: Config, workspaceDir: string): CanUseTool;
// helpers internes : splitSegments, segmentBinary, extractPaths, isInside, validateBash
```
Reproduire fidèlement la version **corrigée** de la V1 (commits a7086de / d2fea5f) :
- split des commandes chaînées sur `&&`, `||`, `;`, `|`, `\n` ; validation de **chaque** segment ;
- allowlist binaires + denylist patterns (depuis `config.security`) ;
- confinement de chemins sur **Read / Write / Edit / Glob / Grep / Bash** ;
- traitement spécial du `cd` (refus sans argument, suivi du `effectiveCwd` à travers les segments).
Retour : `{ behavior: "deny", message }` ou `{ behavior: "allow", updatedInput: input }`.

### 6.4 `src/tools.ts` (← `tools.py`)

```ts
export const REQUIRED_KEYS: Record<string, string[]> = {
  product_spec: ["name","description","design_system","sprints","stack"],
  feature_list_item: ["id","sprint","category","description","passes"],
  sprint_contract: ["sprint_id","sprint_name","agreed_deliverables"],
  qa_report: ["sprint_id","overall_score","verdict","scores","bugs"],
  contract_review: ["sprint_id","approved","feedback"],
};
export function createHarnessTools(workspaceDir: string): McpSdkServerConfigWithInstance;
```
Deux outils :
- `update_progress({ phase, message })` → append `[ts] [phase] message` dans `claude-progress.txt`.
- `validate_json({ file_path, schema_name })` → lit le JSON, valide par clés requises ; cas spécial
  `schema_name === "feature_list"` validé comme tableau d'items. Retour
  `{ content:[{type:"text",text}], isError? }`.
Schémas des params via `zod` (exigence du SDK).

### 6.5 `src/agents/client.ts` (← `agents/client.py`)

```ts
export interface AgentResult {
  textOutput: string; costUsd: number; durationMs: number; numTurns: number;
  isError: boolean; sessionId: string; resultText: string | null;
}
export interface RunAgentOptions { /* miroir des champs Options utilisés */ }
export async function runAgent(prompt: string, options: RunAgentOptions): Promise<AgentResult>;
```
**Runner-A** : prompt `string`, `for await (const msg of q)` ; accumulation du texte des blocs
`type:"text"` ; capture du message `result` pour coût/turns/durée. Watchdog idle : un timer
réinitialisé à chaque message ; au-delà de `IDLE_TIMEOUT` (120 s, comme V1) → `abortController.abort()`.
`default: continue` sur types inconnus. Debug stderr redirigé vers `cli_debug.log` (jamais le terminal,
leçon V1 §9.8). Pas de `ResultMessage` reçu → `isError: true`, `costUsd: 0` (limite V1 conservée).

### 6.6 `src/agents/planner.ts`, `builder.ts`, `evaluator.ts`

Reproduire les factories d'options et les prompts utilisateur construits dynamiquement :
- `runPlanner(userPrompt, config, workspaceDir)` → `product_spec.json`, `feature_list.json`, `init.sh`.
- `runBuilderContract(sprintNum, config, workspaceDir, evaluatorFeedback?)` ;
  `runBuilderImplement(sprintNum, config, workspaceDir, qaFeedback?)`. System prompt =
  `builder_prompt.md` + `---` + `grading_criteria.md`.
- `runEvaluatorReviewContract(sprintNum, config, workspaceDir)` (sans Playwright) ;
  `runEvaluatorQa(sprintNum, config, workspaceDir)` (avec Playwright MCP ; `sprintNum === 0` ⇒
  évaluation finale + `feature_coverage`).
Les system prompts viennent des fichiers `prompts/*.md` **verbatim**.

### 6.7 `src/orchestrator.ts` (← `orchestrator.py`) et `src/index.ts`

`main(userPrompt, projectName)` :
1. `loadConfig("config.yaml")` (parse YAML via `yaml`), `workspace = config.project.workspace + projectName`,
   `mkdir -p` + `git init`, `ProjectProgress.load`.
2. **Phase planning** : `runPlanner` → vérifier les 3 fichiers → `chmod +x init.sh` → exécuter
   `bash init.sh` (timeout 900 s) → enregistrer le run.
3. **Boucle sprints** : pour chaque sprint de `product_spec.sprints` (≤ `max_sprints`) : check budget,
   `runSprint` (negotiateContract sur N rounds → boucle implement+QA sur N retries → cleanup ports),
   `progress.save` après chaque sprint, abort si échec.
4. **Phase finale** : `runEvaluatorQa(0)` → `qa_report_final.json` → log `overall_score`,
   `feature_coverage`.
5. `finally` : `cleanupWorkspacePorts`.
`cleanupWorkspacePorts` : `lsof -tiTCP -sTCP:LISTEN` sur 3000/3001/8000/8001, tuer les PID dont le
cwd est dans le workspace (SIGTERM). `index.ts` parse `argv` et appelle `main`.

Verdict QA (inchangé) : `verdict === "PASS" && overallScore >= config.qa.min_score_global`. Le
détail par critère (≥ `min_score_per_criterion`) est porté par le prompt évaluateur + `grading_criteria.md`.

## 7. Formats JSON inter-agents

Inchangés par rapport à la V1 (cf. `tools.ts:REQUIRED_KEYS` et rapport de cartographie). Les fichiers
écrits par les agents gardent **exactement** les mêmes noms de champs et la même structure
(`product_spec.json`, `feature_list.json`, `sprint_contract_N.json`, `contract_review_N.json`,
`qa_report_N.json` / `qa_report_final.json`, `progress.json`, `claude-progress.txt`).

## 8. Runner & watchdog (détail Runner-A)

- Prompt passé en `string`.
- `AbortController` créé par invocation, branché sur `options.abortController`.
- `lastActivity` mis à jour à chaque message ; un `setInterval` (5 s) vérifie l'inactivité ;
  `now - lastActivity > IDLE_TIMEOUT (120 000 ms)` ⇒ `controller.abort()`.
- Boucle `for await` enveloppée en try/catch : un abort produit `isError:true` (et coût lu si un
  `result` partiel existe, sinon 0).
- `default: continue` sur types non gérés ; debug → fichier.

## 9. Configuration

`config.yaml` reste **tel quel** (mêmes clés : `project`, `models`, `stack`, `orchestration`,
`budget`, `agent_limits.{planner,builder,evaluator}`, `qa`, `security.{bash_allowlist,bash_denylist}`).
`loadConfig` parse via le package `yaml` et caste vers l'interface `Config`. Pas de rechargement à
chaud (limite V1 §9.10 conservée).

## 10. Tests (vitest)

Tests unitaires sur la **logique pure** (sans SDK), pour vérifier l'équivalence comportementale :
- `security.test.ts` : split de commandes chaînées, allowlist/denylist, confinement de chemins,
  cas `cd ../autre-projet && …` (régression documentée V1 §9.14), `cd` sans argument.
- `tools.test.ts` : `validate_json` (clés requises présentes/absentes, cas `feature_list` tableau).
- `progress.test.ts` : `addRun`/`totalCostUsd`, `isOverBudget`, `sprintCost`, round-trip
  `save`/`load` avec champs snake_case.
- `orchestrator-scoring.test.ts` : verdict PASS/FAIL selon `overall_score` et `verdict`.
Les chemins SDK (runner/agents) sont validés par un run réel manuel (pas de mock du CLI au départ).

## 11. Scripts pnpm

`dev` (`tsx src/index.ts`), `start`, `build` (`tsc`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`).
Invocation : `pnpm dev "<prompt>" [project-name]` ⇄ `python orchestrator.py "<prompt>" [project-name]`.

## 12. Risques

- **Buffer JSON** : pas d'équivalent exposé au patch `_MAX_BUFFER_SIZE` 10 Mo. À surveiller si le
  Builder émet d'énormes messages uniques.
- **`interrupt()` streaming-only** : avec Runner-A on utilise `abort()` ; équivalent fonctionnel pour
  notre usage (anti-blocage), mais pas un interrupt « propre » côté CLI.
- **Cleanup Playwright stdio lent** (leçon V1 §9.2) : problème OS indépendant du langage ; le watchdog
  idle couvre la détection.

## 13. Séquence d'implémentation (haut niveau)

1. Scaffold (package.json, tsconfig, vitest, archivage `legacy-python/`).
2. `types.ts` + `progress.ts` (+ tests).
3. `security.ts` (+ tests).
4. `tools.ts` (+ tests).
5. `agents/client.ts` (runner + watchdog).
6. `agents/{planner,builder,evaluator}.ts`.
7. `orchestrator.ts` + `index.ts`.
8. Typecheck vert + tests verts + run réel de fumée.

Le plan détaillé (étapes, ordre, critères de vérif) est produit par la phase « writing-plans ».
