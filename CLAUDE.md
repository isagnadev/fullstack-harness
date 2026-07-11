# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An orchestrator that runs 3 Claude agents (Planner, Builder, Evaluator) via the
`@anthropic-ai/claude-agent-sdk` (TypeScript) to build full-stack web applications autonomously.
Agents communicate through JSON files on disk — never in-memory state.

> **Migration note:** This is a faithful 1:1 TypeScript port of the original Python harness. The
> Python V1 is archived under `legacy-python/` for reference. `config.yaml` and `prompts/` are
> shared, unchanged from V1. The port deliberately preserves V1 behavior **including its known
> limitations** (e.g. `progress.json` is saved only at sprint end; a crashed agent reports
> `cost_usd = 0`). See `docs/superpowers/specs/` and `docs/superpowers/plans/` for the migration spec.
> Assumed divergence (DX-16): unlike V1 (`orchestrator.py:448`), the project name from argv is
> validated (`src/paths.ts`) before resolving the workspace — names not matching `[A-Za-z0-9._-]+`
> (a single path segment; this includes any name escaping `./workspace`) are rejected at startup,
> since the resolved path becomes the root of the agents' security confinement.
> Assumed divergence (DX-15): `main()` runs an environment **preflight** (`src/preflight.ts`,
> absent from V1) before any side effect; on agent `isError` the orchestrator prints the path of
> `cli_debug.log`. The watchdog / `isError` / `cost_usd = 0` conventions themselves are unchanged.

## Commands

```bash
pnpm install                                   # Install deps (@anthropic-ai/claude-agent-sdk, yaml, zod)
pnpm dev "<prompt>" [project-name]             # Run full pipeline → workspace/<project-name>/
pnpm typecheck                                 # tsc --noEmit (must be clean)
pnpm test                                      # vitest run (unit tests for pure-logic modules)
```

Requires Node, `pnpm`, the `claude` CLI installed, and `ANTHROPIC_API_KEY` (or an active CLI
session). Note: `vitest` is pinned to `^2` because `vitest@4` requires Node ≥ 20.19 / ≥ 22.12.

## Architecture

### Three-phase orchestration (`src/orchestrator.ts`)

0. **Preflight** (`src/preflight.ts`, DX-15) — before creating the workspace or running `git init`, `main()` checks the environment with local probes only (no API call): `claude --version` failing is **fatal** (explicit error listing all detected problems at once); a missing `ANTHROPIC_API_KEY` or an unavailable `@playwright/mcp` (when `qa.tools.playwright` is true) is a **warning** only. This turns a bad setup into a < 5 s failure instead of a ~120 s watchdog timeout.
1. **Planning** — Planner agent turns user prompt into `product_spec.json`, `feature_list.json`, and `init.sh`. The orchestrator runs `init.sh` to scaffold the project.
2. **Sprint loop** — For each sprint in the product spec:
   - **Contract negotiation**: Builder proposes `sprint_contract_N.json`, Evaluator reviews → `contract_review_N.json`. Up to `contract_negotiation_rounds` iterations.
   - **Implementation + QA**: Builder implements, Evaluator tests → `qa_report_N.json`. Loops with QA feedback up to `max_retries_per_sprint` times. PASS requires weighted score >= `min_score_global` AND every criterion >= `min_score_per_criterion` (the per-criterion gate is enforced by the evaluator prompt + `grading_criteria.md`; the orchestrator's `sprintPassed()` checks `verdict === "PASS" && overall_score >= min_score_global`).
3. **Final evaluation** — Evaluator runs end-to-end QA (`sprintNum === 0` convention) → `qa_report_final.json`.

Budget is enforced between sprints via `ProjectProgress.isOverBudget()`.

### Agent composition pattern

Each agent module (`src/agents/planner.ts`, `src/agents/builder.ts`, `src/agents/evaluator.ts`) composes three concerns before calling the shared `runAgent()` wrapper (`src/agents/client.ts`):
- **System prompt**: loaded from `prompts/` (written in French) + `grading_criteria.md` appended for builder/evaluator
- **Security**: `src/security.ts:createPermissionHandler()` returns an async `canUseTool` callback enforcing the bash allowlist + workspace filesystem confinement (Read/Write/Edit/Glob/Grep/Bash, with chained-command segment validation and `cd` tracking)
- **MCP tools**: `src/tools.ts:createHarnessTools()` creates an in-process MCP server (`createSdkMcpServer`) with `update_progress` and `validate_json` tools (params declared with zod)

The evaluator conditionally adds Playwright MCP (`@playwright/mcp --headless`) for QA testing mode (not for contract review).

### Runner (`src/agents/client.ts`)

Unlike the Python SDK, the TS SDK's `canUseTool` works with a plain `string` prompt — no streaming-input
mode required. `runAgent()` (Runner-A) passes the prompt as a string, isolates settings
(`settingSources: []`, `strictMcpConfig: true`), and runs an idle **watchdog**: if no SDK message
arrives for 120 s it calls `abortController.abort()`. Unknown SDK message types are ignored
(`switch` `default: continue`, never throw). Cost/turns/duration come from the `result` message; a
missing `result` (crash/abort) yields `isError: true, costUsd: 0`. CLI stderr is redirected to
`cli_debug.log` in the workspace; on every agent `isError` the orchestrator prints that file's
absolute path (`cliDebugLogHint()` in `src/preflight.ts`, DX-15) since it holds the real cause.

### Inter-agent JSON protocol

Agents communicate exclusively via JSON files in the workspace directory:
- `product_spec.json` — full spec with design system, sprints, stack choice
- `feature_list.json` — flat array; builder sets `"passes": true` per feature
- `sprint_contract_N.json` — deliverables with verifiable test criteria
- `contract_review_N.json` — approved/rejected with feedback
- `qa_report_N.json` / `qa_report_final.json` — scored QA reports with bugs
- `progress.json` — cost/run tracking (managed by `ProjectProgress`, snake_case fields preserved)
- `claude-progress.txt` — human-readable timestamped log

Validation schemas for these files are defined in `src/tools.ts:REQUIRED_KEYS` (required-keys check,
not zod — faithful to V1).

## Conventions

- TypeScript strict, ESM (`"type": "module"`), run via `tsx`; type annotations everywhere
- Async functions for all agent interactions
- Git commits: `feat(module): description`
- Agent prompts in `prompts/` are written in French; the inline user-prompts in `src/agents/*.ts` are in English (verbatim from V1)
- All config (models, limits, security, budget, QA thresholds) lives in `config.yaml`; `src/types.ts` mirrors it as compile-time interfaces
- Agents are stateless — each invocation starts fresh via `runAgent()`
- Unit tests (`vitest`) cover the pure-logic modules (`security`, `tools`, `progress`, `paths`, `preflight`) and the exported pure orchestrator helpers, plus the runner's failure paths via a mocked SDK (`tests/client.test.ts`); the full SDK-driven pipeline is validated by real runs
