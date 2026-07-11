/**
 * Suivi de progression et comptabilité des coûts pour les runs du harness.
 *
 * Port fidèle de `progress.py`. Les noms de champs JSON sont conservés en snake_case
 * pour garantir un format de fichier `progress.json` identique à la V1 Python.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** Enregistrement d'une invocation d'agent. */
export interface AgentRun {
  agent: string; // "planner", "builder", "evaluator"
  phase: string; // ex: "planning", "sprint_1_contract", "sprint_1_build_0"
  cost_usd: number;
  duration_ms: number;
  num_turns: number;
  success: boolean;
  timestamp: string;
}

/**
 * Construit un `AgentRun` en ajoutant un `timestamp` = instant courant au format ISO 8601.
 */
export function makeAgentRun(data: Omit<AgentRun, "timestamp">): AgentRun {
  return {
    ...data,
    timestamp: new Date().toISOString(),
  };
}

/** Agrégation de la progression et du suivi des coûts sur l'ensemble des runs. */
export class ProjectProgress {
  project_name: string;
  runs: AgentRun[];
  current_sprint: number; // plus haut sprint atteint (réussi OU échoué)
  failed_sprints: number[];
  total_cost_usd: number;
  /**
   * DX-20 — nombre de runs échoués dont le coût n'a PAS pu être comptabilisé
   * (crash/abort → cost_usd=0, cf. client.ts). Champ d'observabilité additif :
   * absent du format V1 Python, ajouté sans supprimer/renommer aucun champ.
   */
  uncounted_runs: number;

  constructor(project_name: string) {
    this.project_name = project_name;
    this.runs = [];
    this.current_sprint = 0;
    this.failed_sprints = [];
    this.total_cost_usd = 0;
    this.uncounted_runs = 0;
  }

  // ------------------------------------------------------------------
  // Mutators
  // ------------------------------------------------------------------

  addRun(run: AgentRun): void {
    this.runs.push(run);
    // Un run échoué (success=false) a typiquement consommé des tokens avant le
    // crash/abort mais renvoie cost_usd=0 (cf. client.ts). total_cost_usd est
    // donc une BORNE BASSE du coût réel. Fidélité V1 : on additionne cost_usd
    // tel quel (on n'invente aucun coût) ; on compte seulement le run comme
    // « non comptabilisé » pour l'observabilité (DX-20).
    //
    // NB : un run échoué peut aussi porter un coût RÉEL (ResultMessage reçu
    // avec is_error=true, p.ex. error_max_turns : client.ts mappe alors
    // costUsd = resultMsg.total_cost_usd). Ce coût EST additionné ci-dessous —
    // le run n'est donc « non comptabilisé » que si cost_usd=0 (crash/abort
    // sans ResultMessage).
    this.total_cost_usd += run.cost_usd;
    if (run.success === false && run.cost_usd === 0) {
      this.uncounted_runs += 1;
    }
  }

  // ------------------------------------------------------------------
  // Queries
  // ------------------------------------------------------------------

  isOverBudget(maxUsd: number): boolean {
    return this.total_cost_usd >= maxUsd;
  }

  sprintCost(sprintNum: number): number {
    let total = 0;
    for (const r of this.runs) {
      if (r.phase.includes(`sprint_${sprintNum}`)) {
        total += r.cost_usd;
      }
    }
    return total;
  }

  // ------------------------------------------------------------------
  // Persistence
  // ------------------------------------------------------------------

  /** Écrit `progress.json` dans *workspaceDir*. */
  save(workspaceDir: string): void {
    const filePath = path.join(workspaceDir, "progress.json");
    const data = {
      project_name: this.project_name,
      runs: this.runs,
      current_sprint: this.current_sprint,
      failed_sprints: this.failed_sprints,
      total_cost_usd: this.total_cost_usd,
      uncounted_runs: this.uncounted_runs,
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  /** Charge depuis `progress.json` ou retourne une instance vierge. */
  static load(workspaceDir: string): ProjectProgress {
    const filePath = path.join(workspaceDir, "progress.json");
    if (!fs.existsSync(filePath)) {
      return new ProjectProgress("unknown");
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as {
      project_name?: string;
      runs?: AgentRun[];
      current_sprint?: number;
      failed_sprints?: number[];
      total_cost_usd?: number;
      uncounted_runs?: number;
    };
    const progress = new ProjectProgress(data.project_name ?? "unknown");
    progress.runs = data.runs ?? [];
    progress.current_sprint = data.current_sprint ?? 0;
    progress.failed_sprints = data.failed_sprints ?? [];
    progress.total_cost_usd = data.total_cost_usd ?? 0;
    // Rétrocompat : les progress.json V1/antérieurs n'ont pas ce champ.
    progress.uncounted_runs = data.uncounted_runs ?? 0;
    return progress;
  }
}

/** Ajoute une ligne horodatée à `claude-progress.txt`. */
export function appendProgressLog(workspaceDir: string, message: string): void {
  const filePath = path.join(workspaceDir, "claude-progress.txt");
  const ts = formatUtcTimestamp(new Date());
  fs.appendFileSync(filePath, `[${ts}] ${message}\n`, "utf-8");
}

/**
 * Reproduit le format Python `"%Y-%m-%d %H:%M:%S UTC"` (ex: "2026-05-28 12:34:56 UTC").
 * On s'appuie sur les composantes UTC de l'objet Date.
 */
function formatUtcTimestamp(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
}
