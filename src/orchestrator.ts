/**
 * Orchestrateur multi-agents — séquence Planner → Builder ↔ Evaluator.
 *
 * Port fidèle de la V1 Python (`orchestrator.py`). Trois phases :
 * 1. Planning — le Planner transforme un prompt en spécification produit.
 * 2. Boucle de sprints — Builder et Evaluator itèrent sur chaque sprint
 *    (négociation de contrat, implémentation, QA).
 * 3. Évaluation finale — l'Evaluator exécute un test end-to-end complet.
 */

import {
  execFileSync,
  spawnSync,
} from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { runEvaluatorQa, runEvaluatorReviewContract } from "./agents/evaluator";
import { runBuilderContract, runBuilderImplement } from "./agents/builder";
import { runPlanner } from "./agents/planner";
import { resolveWorkspace } from "./paths";
import { cliDebugLogHint, preflight } from "./preflight";
import {
  appendProgressLog,
  makeAgentRun,
  ProjectProgress,
} from "./progress";
import type {
  Config,
  ContractReview,
  ProductSpec,
  QaReport,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Charge et retourne la configuration YAML. */
export function loadConfig(configPath?: string): Config {
  const resolved =
    configPath ??
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../config.yaml",
    );
  const raw = fs.readFileSync(resolved, "utf-8");
  return parse(raw) as Config;
}

/** Lit un fichier JSON du workspace, retournant `null` en cas d'échec. */
export function readJson(workspace: string, filename: string): unknown | null {
  const p = path.join(workspace, filename);
  if (!fs.existsSync(p)) {
    console.warn(`Expected file not found: ${p}`);
    return null;
  }
  try {
    const raw = fs.readFileSync(p, "utf-8");
    return JSON.parse(raw) as unknown;
  } catch {
    console.error(`Invalid JSON in ${p}`);
    return null;
  }
}

// Ports de dev-server que les agents peuvent ouvrir pendant un sprint. Gardé ici
// plutôt que dans config.yaml car c'est un invariant du harness, pas un réglage
// par projet.
const DEV_SERVER_PORTS = ["3000", "3001", "8000", "8001"];

/**
 * Tue tout dev-server écoutant sur :3000/:3001/:8000/:8001 dont le cwd se trouve
 * à l'intérieur de *workspace*.
 *
 * Empêche les zombies de survivre entre sprints. Les processus en dehors du
 * workspace — y compris les serveurs de dev de l'utilisateur pour d'autres
 * projets — sont délibérément laissés intacts.
 */
export function cleanupWorkspacePorts(workspace: string): void {
  let absWorkspace: string;
  try {
    absWorkspace = fs.realpathSync(workspace);
  } catch {
    absWorkspace = path.resolve(workspace);
  }

  let stdout = "";
  try {
    const out = spawnSync(
      "lsof",
      [
        "-tiTCP",
        "-sTCP:LISTEN",
        "-i:" + DEV_SERVER_PORTS.join(","),
      ],
      { encoding: "utf-8", timeout: 5000 },
    );
    if (out.error) {
      console.debug(
        `cleanupWorkspacePorts: lsof unavailable/failed (${out.error}) — ` +
          `skipping port cleanup`,
      );
      return;
    }
    stdout = out.stdout ?? "";
  } catch (e) {
    console.debug(
      `cleanupWorkspacePorts: lsof unavailable/failed (${e}) — ` +
        `skipping port cleanup`,
    );
    return;
  }

  try {
    const pids = stdout.split(/\s+/).filter((p) => /^\d+$/.test(p));

    // DX-14 : sans /proc (macOS, etc.) impossible de filtrer les PID par cwd.
    // Signalé une seule fois plutôt qu'un skip silencieux pid par pid.
    if (!fs.existsSync("/proc")) {
      console.debug(
        `cleanupWorkspacePorts: /proc indisponible ` +
          `(platform=${process.platform}) — impossible de filtrer les PID ` +
          `par cwd, skip`,
      );
      return;
    }

    const killed: string[] = [];
    for (const pid of pids) {
      let cwd: string;
      try {
        cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
      } catch {
        continue;
      }
      let cwdReal: string;
      try {
        cwdReal = fs.realpathSync(cwd);
      } catch {
        cwdReal = path.resolve(cwd);
      }
      if (
        cwdReal === absWorkspace ||
        cwdReal.startsWith(absWorkspace + path.sep)
      ) {
        try {
          process.kill(Number(pid), "SIGTERM");
          killed.push(pid);
        } catch (e) {
          // ProcessLookupError équivalent — le process est déjà terminé.
          console.debug(
            `cleanupWorkspacePorts: process.kill(${pid}) a échoué ` +
              `(probablement déjà terminé) — ${e}`,
          );
        }
      }
    }

    if (killed.length > 0) {
      console.info(`Cleaned up dev-server zombies: PIDs ${killed.join(",")}`);
      appendProgressLog(
        workspace,
        `Cleaned up dev-server zombies: PIDs ${killed.join(",")}`,
      );
    }
  } catch (e) {
    // try/catch tout — ne jamais faire échouer le nettoyage.
    console.debug(`cleanupWorkspacePorts: erreur inattendue ignorée — ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Phase 1 — Planning
// ---------------------------------------------------------------------------

/** Exécute l'agent planner. Retourne *true* en cas de succès. */
export async function phasePlanning(
  userPrompt: string,
  config: Config,
  workspace: string,
  progress: ProjectProgress,
): Promise<boolean> {
  console.info("═══ PHASE 1: PLANNING ═══");
  appendProgressLog(workspace, "Phase 1: Planning started");

  const result = await runPlanner(userPrompt, config, workspace);
  progress.addRun(
    makeAgentRun({
      agent: "planner",
      phase: "planning",
      cost_usd: result.costUsd,
      duration_ms: result.durationMs,
      num_turns: result.numTurns,
      success: !result.isError,
    }),
  );

  if (result.isError) {
    console.error("Planner agent failed");
    console.error(cliDebugLogHint(workspace));
    return false;
  }

  // Valide les sorties.
  const requiredFiles = ["product_spec.json", "feature_list.json", "init.sh"];
  for (const fname of requiredFiles) {
    if (!fs.existsSync(path.join(workspace, fname))) {
      console.error(`Planner did not produce ${fname}`);
      return false;
    }
  }

  // Rend init.sh exécutable et le lance.
  const initSh = path.join(workspace, "init.sh");
  fs.chmodSync(initSh, 0o755);
  console.info("Running init.sh …");
  try {
    execFileSync("bash", [initSh], {
      cwd: workspace,
      encoding: "utf-8",
      timeout: 900000,
    });
  } catch (exc: unknown) {
    const err = exc as { code?: string; stderr?: string };
    if (err.code === "ETIMEDOUT") {
      console.error("init.sh timed out after 900s");
      return false;
    }
    console.error(`init.sh failed:\n${err.stderr ?? ""}`);
    return false;
  }

  const cost = result.costUsd;
  console.info(`Planning complete — cost: $${cost.toFixed(4)}`);
  appendProgressLog(workspace, `Phase 1: Planning complete ($${cost.toFixed(4)})`);
  return true;
}

// ---------------------------------------------------------------------------
// Phase 2 — Sprint Loop
// ---------------------------------------------------------------------------

/**
 * Négocie un contrat de sprint entre builder et evaluator.
 *
 * Retourne *true* si un contrat a été approuvé.
 */
export async function negotiateContract(
  sprintNum: number,
  config: Config,
  workspace: string,
  progress: ProjectProgress,
): Promise<boolean> {
  const maxRounds = config.orchestration.contract_negotiation_rounds;
  let evaluatorFeedback: string | null = null;

  for (let roundNum = 1; roundNum <= maxRounds; roundNum++) {
    console.info(`  Contract negotiation round ${roundNum}/${maxRounds}`);

    // Le builder propose.
    const bResult = await runBuilderContract(
      sprintNum,
      config,
      workspace,
      evaluatorFeedback,
    );
    progress.addRun(
      makeAgentRun({
        agent: "builder",
        phase: `sprint_${sprintNum}_contract_${roundNum}`,
        cost_usd: bResult.costUsd,
        duration_ms: bResult.durationMs,
        num_turns: bResult.numTurns,
        success: !bResult.isError,
      }),
    );
    if (bResult.isError) {
      console.error(cliDebugLogHint(workspace));
    }

    const contract = readJson(workspace, `sprint_contract_${sprintNum}.json`);
    if (contract === null) {
      console.warn("  Builder did not produce a contract file");
      continue;
    }

    // L'evaluator révise.
    const eResult = await runEvaluatorReviewContract(
      sprintNum,
      config,
      workspace,
    );
    progress.addRun(
      makeAgentRun({
        agent: "evaluator",
        phase: `sprint_${sprintNum}_review_${roundNum}`,
        cost_usd: eResult.costUsd,
        duration_ms: eResult.durationMs,
        num_turns: eResult.numTurns,
        success: !eResult.isError,
      }),
    );
    if (eResult.isError) {
      console.error(cliDebugLogHint(workspace));
    }

    const review = readJson(
      workspace,
      `contract_review_${sprintNum}.json`,
    ) as ContractReview | null;
    if (review === null) {
      console.warn("  Evaluator did not produce a review file");
      continue;
    }

    if (review.approved) {
      console.info("  Contract approved ✓");
      return true;
    }

    evaluatorFeedback =
      (review.feedback ?? "") +
      "\n" +
      JSON.stringify(review.requested_changes ?? [], null, 2);
    console.info("  Contract rejected — iterating");
  }

  console.warn(
    `  Contract not approved after ${maxRounds} rounds — proceeding anyway`,
  );
  return false;
}

/**
 * Détermine si un rapport QA constitue un PASS.
 *
 * Fonction PURE extraite pour la testabilité — reproduit la condition V1 :
 * `verdict === 'PASS' && overall_score >= minScore`.
 */
export function sprintPassed(
  report: { verdict?: unknown; overall_score?: number } | null | undefined,
  minScore: number,
): boolean {
  return report?.verdict === "PASS" && (report?.overall_score ?? 0) >= minScore;
}

/**
 * Exécute un sprint unique : négociation → implémentation → QA.
 *
 * Retourne *true* si le sprint passe la QA.
 */
export async function runSprint(
  sprintNum: number,
  config: Config,
  workspace: string,
  progress: ProjectProgress,
): Promise<boolean> {
  console.info(`─── Sprint ${sprintNum} ───`);
  appendProgressLog(workspace, `Sprint ${sprintNum}: started`);

  // Nettoie les dev-servers laissés par les agents du sprint précédent.
  cleanupWorkspacePorts(workspace);

  // 1. Négociation de contrat.
  await negotiateContract(sprintNum, config, workspace, progress);

  // 2. Boucle implémentation + QA.
  const maxRetries = config.orchestration.max_retries_per_sprint;
  let qaFeedback: string | null = null;
  const qaScore = config.qa.min_score_global;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.info(`  Implementation attempt ${attempt}/${maxRetries}`);

    // Le builder implémente.
    const bResult = await runBuilderImplement(
      sprintNum,
      config,
      workspace,
      qaFeedback,
    );
    progress.addRun(
      makeAgentRun({
        agent: "builder",
        phase: `sprint_${sprintNum}_build_${attempt}`,
        cost_usd: bResult.costUsd,
        duration_ms: bResult.durationMs,
        num_turns: bResult.numTurns,
        success: !bResult.isError,
      }),
    );

    if (bResult.isError) {
      console.warn("  Builder agent errored — retrying");
      console.error(cliDebugLogHint(workspace));
      continue;
    }

    // QA de l'evaluator.
    const eResult = await runEvaluatorQa(sprintNum, config, workspace);
    progress.addRun(
      makeAgentRun({
        agent: "evaluator",
        phase: `sprint_${sprintNum}_qa_${attempt}`,
        cost_usd: eResult.costUsd,
        duration_ms: eResult.durationMs,
        num_turns: eResult.numTurns,
        success: !eResult.isError,
      }),
    );
    if (eResult.isError) {
      console.error(cliDebugLogHint(workspace));
    }

    const report = readJson(
      workspace,
      `qa_report_${sprintNum}.json`,
    ) as QaReport | null;
    if (report === null) {
      console.warn("  Evaluator did not produce QA report");
      continue;
    }

    const score = report.overall_score ?? 0;
    const verdict = report.verdict ?? "FAIL";
    console.info(`  QA score: ${score.toFixed(1)}/10 — ${verdict}`);

    if (sprintPassed(report, qaScore)) {
      appendProgressLog(
        workspace,
        `Sprint ${sprintNum}: PASSED (score ${score.toFixed(1)})`,
      );
      return true;
    }

    // Construit la chaîne de feedback pour le builder.
    const bugs = report.bugs ?? [];
    const feedbackParts: string[] = [report.feedback ?? ""];
    for (const bug of bugs) {
      feedbackParts.push(
        `- [${bug.severity ?? "unknown"}] ${bug.description ?? ""}` +
          ` (file: ${bug.file ?? "?"}, line: ${bug.line ?? "?"})` +
          ` → Fix: ${bug.suggested_fix ?? "N/A"}`,
      );
    }
    qaFeedback = feedbackParts.join("\n");
    console.info("  QA failed — sending feedback to builder");
  }

  console.warn(
    `  Sprint ${sprintNum} failed after ${maxRetries} attempts — skipping`,
  );
  appendProgressLog(
    workspace,
    `Sprint ${sprintNum}: SKIPPED after ${maxRetries} failed attempts`,
  );
  return false;
}

/**
 * Avertissement « borne basse » du garde-fou budgétaire (DX-20).
 *
 * Fonction PURE extraite pour la testabilité. Les runs échoués (crash/abort)
 * rapportent cost_usd=0 (cf. client.ts) alors qu'ils ont typiquement déjà
 * consommé des tokens côté API : total_cost_usd sous-estime alors le coût
 * réel. Retourne null quand il n'y a rien à signaler (aucun run non
 * comptabilisé).
 */
export function formatUncountedRunsWarning(
  uncountedRuns: number,
  totalCostUsd: number,
  budgetMax: number,
): string | null {
  if (uncountedRuns <= 0) {
    return null;
  }
  return (
    `Note: ${uncountedRuns} failed run(s) with unaccounted cost — real API ` +
    `cost likely exceeds total_cost_usd ($${totalCostUsd.toFixed(2)} / ` +
    `$${budgetMax.toFixed(2)}); the budget guard is a lower bound.`
  );
}

/** Exécute tous les sprints du product spec. */
export async function phaseSprints(
  config: Config,
  workspace: string,
  progress: ProjectProgress,
): Promise<void> {
  console.info("═══ PHASE 2: SPRINT LOOP ═══");

  const spec = readJson(workspace, "product_spec.json") as ProductSpec | null;
  if (spec === null || !("sprints" in spec)) {
    console.error("Cannot read sprints from product_spec.json");
    return;
  }

  const sprints = spec.sprints;
  const maxSprints = config.orchestration.max_sprints;
  const budgetMax = config.budget.max_total_usd;

  // Si un run précédent a laissé des sprints en échec, on s'arrête immédiatement —
  // l'utilisateur doit les examiner et soit réessayer (les retirer de
  // failed_sprints) soit abandonner.
  if (progress.failed_sprints.length > 0) {
    console.error(
      `Previous run has failed sprints: ${JSON.stringify(progress.failed_sprints)}. ` +
        "Review them and edit progress.json (remove from failed_sprints + lower " +
        "current_sprint) to retry, then relaunch.",
    );
    return;
  }

  for (const sprint of sprints.slice(0, maxSprints)) {
    const sprintNum = sprint.id;

    // Saute les sprints déjà terminés.
    if (sprintNum <= progress.current_sprint) {
      console.info(`─── Sprint ${sprintNum} (skipped — already done) ───`);
      continue;
    }

    // Vérification du budget. total_cost_usd est une BORNE BASSE : les runs
    // crashés/avortés rapportent cost_usd=0 (DX-20) — on le signale à
    // l'opérateur sans changer la sémantique de isOverBudget.
    const uncountedWarning = formatUncountedRunsWarning(
      progress.uncounted_runs,
      progress.total_cost_usd,
      budgetMax,
    );
    if (uncountedWarning !== null) {
      console.warn(uncountedWarning);
    }
    if (progress.isOverBudget(budgetMax)) {
      console.warn(
        `Budget exceeded ($${progress.total_cost_usd.toFixed(2)} / ` +
          `$${budgetMax.toFixed(2)}) — stopping`,
      );
      break;
    }

    const passed = await runSprint(sprintNum, config, workspace, progress);
    progress.current_sprint = sprintNum;

    if (!passed) {
      progress.failed_sprints.push(sprintNum);
      progress.save(workspace);
      console.error(
        `  Sprint ${sprintNum} FAILED after all retries — stopping pipeline. ` +
          `Cumulative cost: $${progress.total_cost_usd.toFixed(2)}`,
      );
      appendProgressLog(
        workspace,
        `Sprint ${sprintNum}: FAILED — pipeline stopped`,
      );
      return;
    }

    progress.save(workspace);
    console.info(
      `  Sprint ${sprintNum} PASSED — cumulative cost: ` +
        `$${progress.total_cost_usd.toFixed(2)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Phase 3 — Final Evaluation
// ---------------------------------------------------------------------------

/** Exécute l'évaluation end-to-end finale. */
export async function phaseFinalEvaluation(
  config: Config,
  workspace: string,
  progress: ProjectProgress,
): Promise<void> {
  console.info("═══ PHASE 3: FINAL EVALUATION ═══");
  appendProgressLog(workspace, "Phase 3: Final evaluation started");

  const result = await runEvaluatorQa(0, config, workspace); // sprint 0 = final
  progress.addRun(
    makeAgentRun({
      agent: "evaluator",
      phase: "final_evaluation",
      cost_usd: result.costUsd,
      duration_ms: result.durationMs,
      num_turns: result.numTurns,
      success: !result.isError,
    }),
  );
  if (result.isError) {
    console.error(cliDebugLogHint(workspace));
  }

  const report = readJson(workspace, "qa_report_final.json") as QaReport | null;
  if (report) {
    const score = report.overall_score ?? 0;
    const coverage = report.feature_coverage ?? "?";
    console.info(
      `Final score: ${score.toFixed(1)}/10 — Feature coverage: ${coverage}%`,
    );
  } else {
    console.warn("Final evaluation did not produce a report");
  }

  appendProgressLog(workspace, "Phase 3: Final evaluation complete");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/** Point d'entrée d'orchestration de haut niveau. */
export async function main(
  userPrompt: string,
  projectName: string,
): Promise<void> {
  const config = loadConfig();

  // DX-15 : preflight des prérequis d'environnement (CLI claude, clé/session,
  // playwright) AVANT tout effet de bord (mkdir, git init) — échec fatal en
  // quelques ms plutôt qu'après 120 s de watchdog ; aucun appel API payant.
  preflight(config);

  // DX-16 : valide projectName AVANT tout effet de bord (mkdir, git init,
  // permission handler) — le chemin résolu devient la racine du confinement.
  const workspace = resolveWorkspace(config.project.workspace, projectName);
  fs.mkdirSync(workspace, { recursive: true });

  // Initialise git si ce n'est pas déjà fait.
  if (!fs.existsSync(path.join(workspace, ".git"))) {
    execFileSync("git", ["init"], { cwd: workspace, encoding: "utf-8" });
  }

  const progress = ProjectProgress.load(workspace);
  progress.project_name = projectName;

  console.info(`Project: ${projectName}`);
  console.info(`Workspace: ${workspace}`);
  console.info(`Budget: $${config.budget.max_total_usd.toFixed(2)}`);
  console.info("");

  // Phase 1: Planning — sauté si les sorties existent déjà.
  const requiredFiles = ["product_spec.json", "feature_list.json", "init.sh"];
  if (
    requiredFiles.every((f) => fs.existsSync(path.join(workspace, f)))
  ) {
    console.info("═══ PHASE 1: PLANNING (skipped — already done) ═══");
  } else {
    const ok = await phasePlanning(userPrompt, config, workspace, progress);
    progress.save(workspace);
    if (!ok) {
      // DX-20 : un planner crashé/avorté pousse un run cost_usd=0 — sans ce
      // warning, le run se terminerait ici (exit avant les deux autres sites
      // d'émission : check budget inter-sprints et résumé final) avec
      // uncounted_runs persisté mais aucune mention de la borne basse.
      const planningUncountedWarning = formatUncountedRunsWarning(
        progress.uncounted_runs,
        progress.total_cost_usd,
        config.budget.max_total_usd,
      );
      if (planningUncountedWarning !== null) {
        console.warn(planningUncountedWarning);
      }
      console.error("Planning failed — aborting");
      process.exit(1);
    }
  }

  try {
    // Phase 2: Boucle de sprints.
    await phaseSprints(config, workspace, progress);
    progress.save(workspace);

    // Phase 3: Évaluation finale — sautée si le rapport existe déjà.
    if (fs.existsSync(path.join(workspace, "qa_report_final.json"))) {
      console.info("═══ PHASE 3: FINAL EVALUATION (skipped — already done) ═══");
    } else {
      await phaseFinalEvaluation(config, workspace, progress);
      progress.save(workspace);
    }
  } finally {
    // Nettoie toujours les zombies dev-server, même sur Ctrl+C ou crash.
    cleanupWorkspacePorts(workspace);
  }

  // Résumé.
  console.info("");
  console.info("═══ SUMMARY ═══");
  console.info(`Sprints completed: ${progress.current_sprint}`);
  console.info(`Total runs: ${progress.runs.length}`);
  console.info(`Total cost: $${progress.total_cost_usd.toFixed(2)}`);
  // DX-20 : signale les runs échoués non comptabilisés (total = borne basse).
  const summaryUncountedWarning = formatUncountedRunsWarning(
    progress.uncounted_runs,
    progress.total_cost_usd,
    config.budget.max_total_usd,
  );
  if (summaryUncountedWarning !== null) {
    console.warn(summaryUncountedWarning);
  }
  console.info(`Workspace: ${workspace}`);
}
