/**
 * Builder agent — implements features sprint by sprint.
 *
 * Port fidèle de la V1 Python (`agents/builder.py`).
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

/** Construit les `Options` partagées pour les deux modes du builder. */
function loadBuilderOptions(config: Config, workspaceDir: string): Options {
  const systemPrompt = readFileSync(
    path.join(PROMPTS_DIR, "builder_prompt.md"),
    "utf-8",
  );
  const grading = readFileSync(
    path.join(PROMPTS_DIR, "grading_criteria.md"),
    "utf-8",
  );
  const agentCfg = config.agent_limits.builder;

  return {
    model: config.models.builder,
    systemPrompt: systemPrompt + "\n\n---\n\n" + grading,
    cwd: workspaceDir,
    maxTurns: agentCfg.max_turns,
    permissionMode: agentCfg.permission_mode as Options["permissionMode"],
    allowedTools: agentCfg.allowed_tools,
    mcpServers: { harness: createHarnessTools(workspaceDir) },
    canUseTool: createPermissionHandler(config, workspaceDir),
  };
}

// ---------------------------------------------------------------------------
// Contract Negotiation Mode
// ---------------------------------------------------------------------------

/**
 * Have the builder propose (or revise) a sprint contract.
 *
 * The builder reads `product_spec.json` and `feature_list.json` then
 * writes `sprint_contract_{sprint_num}.json`.
 */
export async function runBuilderContract(
  sprintNum: number,
  config: Config,
  workspaceDir: string,
  evaluatorFeedback?: string | null,
): Promise<AgentResult> {
  const options = loadBuilderOptions(config, workspaceDir);

  let feedbackSection = "";
  if (evaluatorFeedback) {
    feedbackSection = `
## Evaluator Feedback on Previous Contract Proposal

The evaluator rejected your previous contract. Address these concerns:

${evaluatorFeedback}
`;
  }

  const prompt = `## Mode: Sprint Contract Proposal

Sprint number: ${sprintNum}

## Instructions

1. Read \`product_spec.json\` to understand the full product spec.
2. Read \`feature_list.json\` to identify which features belong to sprint ${sprintNum}.
3. Read \`claude-progress.txt\` and \`git log --oneline -20\` for project context.
4. Propose a sprint contract by writing \`sprint_contract_${sprintNum}.json\`.

The contract must include:
- \`sprint_id\` and \`sprint_name\`
- \`agreed_deliverables\`: array of features with \`feature\`, \`feature_id\`, and \`test_criteria\`
- \`out_of_scope\`: what is NOT included
- \`technical_approach\`: 2-3 sentence summary

Make test criteria **specific and verifiable** (e.g., "clicking X opens Y", "API returns 201").
${feedbackSection}`;

  return runAgent(prompt, options);
}

// ---------------------------------------------------------------------------
// Implementation Mode
// ---------------------------------------------------------------------------

/**
 * Have the builder implement (or fix) a sprint.
 *
 * The builder reads `sprint_contract_{sprint_num}.json` and produces
 * working code, tests, commits, and progress updates.
 */
export async function runBuilderImplement(
  sprintNum: number,
  config: Config,
  workspaceDir: string,
  qaFeedback?: string | null,
): Promise<AgentResult> {
  const options = loadBuilderOptions(config, workspaceDir);

  let feedbackSection = "";
  if (qaFeedback) {
    feedbackSection = `
## QA Feedback to Address

The evaluator found issues in your previous implementation. Fix them:

${qaFeedback}
`;
  }

  const prompt = `## Mode: Sprint Implementation

Sprint number: ${sprintNum}

## Sprint Protocol

Follow these steps IN ORDER:

1. \`pwd\` — verify you're in the right directory
2. Read \`claude-progress.txt\` for current project state
3. Read \`git log --oneline -20\` for recent history
4. Read \`feature_list.json\` — identify features for sprint ${sprintNum}
5. Read \`sprint_contract_${sprintNum}.json\` for the agreed deliverables
6. Check if \`init.sh\` needs to be run (e.g., first sprint)
7. Verify existing features still work (run existing tests)
8. Implement the sprint deliverables

## Implementation Rules

- Work on ONE feature at a time
- Write unit tests for each endpoint/component
- Self-test before marking done (run tests, curl endpoints)
- Commit each feature: \`git add -A && git commit -m "feat(module): description"\`
- Update \`feature_list.json\`: set \`"passes": true\` for completed features
- Update \`claude-progress.txt\` with a sprint summary
- If a previous feature breaks, fix it BEFORE continuing
- NEVER delete or modify existing feature descriptions in feature_list.json
${feedbackSection}`;

  return runAgent(prompt, options);
}
