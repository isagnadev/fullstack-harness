/**
 * Interfaces partagées — miroir compile-time de `config.yaml` et des artefacts JSON inter-agents.
 *
 * La validation runtime des artefacts reste assurée par les clés requises de `tools.ts`
 * (`REQUIRED_KEYS`), pas par ces interfaces. Les noms de champs en snake_case sont conservés à
 * l'identique de la V1 Python pour garantir un format de fichier inchangé.
 */

export interface AgentLimits {
  max_turns: number;
  permission_mode: string;
  allowed_tools: string[];
}

export interface Config {
  project: {
    name: string;
    workspace: string;
  };
  models: {
    planner: string;
    builder: string;
    evaluator: string;
  };
  stack: {
    frontend: string;
    backend: string;
    backend_options: string[];
    database: string;
  };
  orchestration: {
    max_sprints: number;
    max_retries_per_sprint: number;
    contract_negotiation_rounds: number;
  };
  budget: {
    max_total_usd: number;
  };
  agent_limits: {
    planner: AgentLimits;
    builder: AgentLimits;
    evaluator: AgentLimits;
  };
  qa: {
    min_score_global: number;
    min_score_per_criterion: number;
    tools: {
      playwright: boolean;
      unit_tests: boolean;
      curl: boolean;
    };
  };
  security: {
    bash_allowlist: string[];
    bash_denylist: string[];
  };
}

// --- Artefacts JSON (champs souples : les agents produisent ces fichiers librement) ---

export interface ProductSpec {
  name: string;
  description: string;
  design_system: Record<string, unknown>;
  sprints: Array<{ id: number; name: string; features: string[]; [k: string]: unknown }>;
  stack: Record<string, unknown>;
  [k: string]: unknown;
}

export interface FeatureListItem {
  id: string;
  sprint: number;
  category: string;
  description: string;
  passes: boolean;
  [k: string]: unknown;
}

export interface SprintContract {
  sprint_id: number;
  sprint_name: string;
  agreed_deliverables: unknown[];
  [k: string]: unknown;
}

export interface ContractReview {
  sprint_id: number;
  approved: boolean;
  feedback: string;
  requested_changes?: unknown[];
  [k: string]: unknown;
}

export interface QaReportBug {
  severity?: string;
  description?: string;
  file?: string;
  line?: number | string;
  suggested_fix?: string;
  [k: string]: unknown;
}

export interface QaReport {
  sprint_id: number;
  overall_score: number;
  verdict: string;
  scores: Record<string, unknown>;
  bugs: QaReportBug[];
  feedback?: string;
  feature_coverage?: number | string;
  [k: string]: unknown;
}
