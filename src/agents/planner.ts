/**
 * Agent Planner — transforme un prompt utilisateur en spécification produit.
 *
 * Port fidèle de la V1 Python (`agents/planner.py`).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Options } from "@anthropic-ai/claude-agent-sdk";

import { createPermissionHandler } from "../security";
import { createHarnessTools } from "../tools";
import type { Config } from "../types";
import { runAgent, type AgentResult } from "./client";

const PROMPTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../prompts",
);

/**
 * Exécute l'agent planner pour produire product_spec.json, feature_list.json et init.sh.
 *
 * @param userPrompt   La requête utilisateur brute (1-4 phrases).
 * @param config       Contenu parsé de config.yaml.
 * @param workspaceDir Chemin absolu vers le répertoire de workspace du projet.
 */
export async function runPlanner(
  userPrompt: string,
  config: Config,
  workspaceDir: string,
): Promise<AgentResult> {
  const systemPrompt = readFileSync(
    path.join(PROMPTS_DIR, "planner_prompt.md"),
    "utf-8",
  );
  const agentCfg = config.agent_limits.planner;

  const options: Options = {
    model: config.models.planner,
    systemPrompt,
    cwd: workspaceDir,
    maxTurns: agentCfg.max_turns,
    permissionMode: agentCfg.permission_mode as Options["permissionMode"],
    allowedTools: agentCfg.allowed_tools,
    mcpServers: { harness: createHarnessTools(workspaceDir) },
    canUseTool: createPermissionHandler(config, workspaceDir),
  };

  // Construit le prompt complet avec le contexte.
  const stackOptions = config.stack;
  const frontend = stackOptions.frontend ?? "nextjs-tailwind";
  const backendOptions = stackOptions.backend_options ?? ["api-platform", "fastapi"];
  const database = stackOptions.database ?? "sqlite";

  const fullPrompt = `## User Request

${userPrompt}

## Context

- Your workspace is: ${workspaceDir}
- Frontend stack: ${frontend}
- Backend options: ${backendOptions.join(", ")}
- Database: ${database}

## Instructions

Produce exactly these 3 files in the workspace root:

1. **product_spec.json** — Full product specification with design system, sprints, and stack choice.
2. **feature_list.json** — Flat array of all features with IDs, sprint assignments, and \`"passes": false\`.
3. **init.sh** — Idempotent bash script to scaffold the project (directories, dependencies, configs).

Start by analyzing the user request, then design the product, then write the files.
`;

  return runAgent(fullPrompt, options);
}
