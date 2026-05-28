/**
 * Agent Evaluator (QA) — teste le travail du builder et produit des rapports scorés.
 *
 * Port fidèle de la V1 Python (`agents/evaluator.py`).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { McpServerConfig, Options } from "@anthropic-ai/claude-agent-sdk";

import { createPermissionHandler } from "../security";
import { createHarnessTools } from "../tools";
import type { Config } from "../types";
import { runAgent, type AgentResult } from "./client";

const PROMPTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../prompts",
);

/** Construit les Options partagées pour les deux modes de l'evaluator. */
function loadEvaluatorOptions(
  config: Config,
  workspaceDir: string,
  withPlaywright: boolean,
): Options {
  const systemPrompt = readFileSync(
    path.join(PROMPTS_DIR, "evaluator_prompt.md"),
    "utf-8",
  );
  const grading = readFileSync(
    path.join(PROMPTS_DIR, "grading_criteria.md"),
    "utf-8",
  );
  const agentCfg = config.agent_limits.evaluator;

  const mcpServers: Record<string, McpServerConfig> = {
    harness: createHarnessTools(workspaceDir),
  };
  const allowedTools = [...agentCfg.allowed_tools];

  if (withPlaywright && config.qa.tools.playwright) {
    mcpServers["playwright"] = {
      type: "stdio",
      command: "npx",
      args: ["@playwright/mcp", "--headless"],
    };
    // Autorise tous les outils playwright
    allowedTools.push("mcp__playwright__*");
  }

  return {
    model: config.models.evaluator,
    systemPrompt: systemPrompt + "\n\n---\n\n" + grading,
    cwd: workspaceDir,
    maxTurns: agentCfg.max_turns,
    permissionMode: agentCfg.permission_mode as Options["permissionMode"],
    allowedTools,
    mcpServers,
    canUseTool: createPermissionHandler(config, workspaceDir),
  };
}

// ---------------------------------------------------------------------------
// Contract Review Mode
// ---------------------------------------------------------------------------

/**
 * Fait réviser un contrat de sprint par l'evaluator.
 *
 * Lit `sprint_contract_{sprintNum}.json` et écrit
 * `contract_review_{sprintNum}.json`.
 */
export async function runEvaluatorReviewContract(
  sprintNum: number,
  config: Config,
  workspaceDir: string,
): Promise<AgentResult> {
  const options = loadEvaluatorOptions(config, workspaceDir, false);

  const prompt = `## Mode: Contract Review

Sprint number: ${sprintNum}

## Instructions

1. Read \`product_spec.json\` to understand the full product spec.
2. Read \`feature_list.json\` to see which features belong to sprint ${sprintNum}.
3. Read \`sprint_contract_${sprintNum}.json\` — the builder's proposed contract.

## Review Criteria

Check that:
- Test criteria are **specific and verifiable** (not vague like "UI looks good")
- Scope is **realistic** for a single sprint
- Deliverables cover **all features** assigned to this sprint in product_spec.json
- \`out_of_scope\` is **explicit** and reasonable
- \`technical_approach\` is sound

## Output

Write \`contract_review_${sprintNum}.json\` with:
- \`sprint_id\`: ${sprintNum}
- \`approved\`: true/false
- \`feedback\`: detailed comments
- \`requested_changes\`: array of changes (if approved=false)

Be constructive but rigorous. Approve if the contract is solid. Reject if test
criteria are vague, scope is unrealistic, or features are missing.
`;

  return runAgent(prompt, options);
}

// ---------------------------------------------------------------------------
// QA Testing Mode
// ---------------------------------------------------------------------------

/**
 * Fait exécuter une QA complète d'une implémentation de sprint par l'evaluator.
 *
 * Utilise Playwright MCP pour les tests navigateur, plus tests unitaires et curl.
 * Écrit `qa_report_{sprintNum}.json` (ou `qa_report_final.json` quand
 * *sprintNum* vaut 0).
 */
export async function runEvaluatorQa(
  sprintNum: number,
  config: Config,
  workspaceDir: string,
): Promise<AgentResult> {
  const options = loadEvaluatorOptions(config, workspaceDir, true);

  const qaConfig = config.qa;
  const minGlobal = qaConfig.min_score_global;
  const minCriterion = qaConfig.min_score_per_criterion;

  const reportName =
    sprintNum === 0 ? "qa_report_final.json" : `qa_report_${sprintNum}.json`;

  const modeLabel =
    sprintNum === 0 ? "Final Evaluation" : `Sprint ${sprintNum} QA`;
  let scopeInstructions = "";
  if (sprintNum === 0) {
    scopeInstructions = `
## Final Evaluation Scope

This is the FINAL evaluation of the entire application.
1. Read \`product_spec.json\` and \`feature_list.json\`
2. Test EVERY feature marked \`"passes": true\`
3. Test cross-cutting flows (auth → navigation → action → result)
4. Include \`"feature_coverage"\` in the report: % of features that actually pass
`;
  } else {
    scopeInstructions = `
## Sprint Scope

Test ONLY the deliverables in \`sprint_contract_${sprintNum}.json\`.
Also verify that previously passing features haven't regressed.
`;
  }

  const prompt = `## Mode: ${modeLabel}

${scopeInstructions}

## Testing Protocol

### a) Browser Tests (Playwright)
- Navigate the app as a real user
- Click every button, fill every form
- Take screenshots for visual verification
- Test responsive viewports (375px mobile, 1280px desktop)
- Test complete end-to-end flows

### b) Programmatic Tests
- Run unit tests: \`npm test\` / \`pytest\` / \`phpunit\`
- Send curl requests to API endpoints
- Verify HTTP status codes and JSON response schemas
- Test edge cases: empty fields, invalid data, missing auth

### c) Code Review
- Read modified source files
- Check for duplicated code, dead code, leftover TODOs
- Verify test coverage of main paths

## Scoring

Rate each criterion 1-10:
| Criterion | Weight |
|-----------|--------|
| Completeness | 30% |
| Design quality | 25% |
| Robustness | 25% |
| Code quality | 20% |

- **PASS**: weighted score >= ${minGlobal} AND every criterion >= ${minCriterion}
- **FAIL**: otherwise

## Output

Write \`${reportName}\` with the full QA report structure including:
scores, bugs (with file, line, reproduction steps, suggested fix),
tests_run counts, feedback summary, and screenshots.

**Be SKEPTICAL.** Test like a real user, not a developer. Never approve
a sprint where a core feature is broken.
`;

  return runAgent(prompt, options);
}
