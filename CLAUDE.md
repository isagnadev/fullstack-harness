# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An orchestrator that runs 3 Claude Opus 4.6 agents (Planner, Builder, Evaluator) via the `claude-code-sdk` to build full-stack web applications autonomously. Agents communicate through JSON files on disk — never in-memory state.

## Commands

```bash
pip install -r requirements.txt                # Install deps (claude-code-sdk, pyyaml)
python orchestrator.py "<prompt>" [project-name]  # Run full pipeline → workspace/<project-name>/
python -c "import yaml; yaml.safe_load(open('config.yaml'))"  # Validate config
python -c "from agents.client import run_agent; from agents.planner import run_planner; print('OK')"  # Check imports
```

## Architecture

### Three-phase orchestration (`orchestrator.py`)

1. **Planning** — Planner agent turns user prompt into `product_spec.json`, `feature_list.json`, and `init.sh`. The orchestrator runs `init.sh` to scaffold the project.
2. **Sprint loop** — For each sprint in the product spec:
   - **Contract negotiation**: Builder proposes `sprint_contract_N.json`, Evaluator reviews → `contract_review_N.json`. Up to `contract_negotiation_rounds` iterations.
   - **Implementation + QA**: Builder implements, Evaluator tests → `qa_report_N.json`. Loops with QA feedback up to `max_retries_per_sprint` times. PASS requires weighted score >= `min_score_global` AND every criterion >= `min_score_per_criterion`.
3. **Final evaluation** — Evaluator runs end-to-end QA (sprint_num=0 convention) → `qa_report_final.json`.

Budget is enforced between sprints via `ProjectProgress.is_over_budget()`.

### Agent composition pattern

Each agent module (`agents/planner.py`, `agents/builder.py`, `agents/evaluator.py`) composes three concerns before calling the shared `run_agent()` wrapper:
- **System prompt**: loaded from `prompts/` (written in French) + `grading_criteria.md` appended for builder/evaluator
- **Security**: `security.py:create_permission_handler()` returns an async `can_use_tool` callback enforcing bash allowlist + workspace filesystem confinement
- **MCP tools**: `tools.py:create_harness_tools()` creates an in-process MCP server with `update_progress` and `validate_json` tools

The evaluator conditionally adds Playwright MCP for QA testing mode (not for contract review).

### SDK streaming constraint

`claude_code_sdk.query()` requires an `AsyncIterable[dict]` prompt (not a string) when `can_use_tool` is set. The wrapper `agents/client.py:_wrap_prompt_as_stream()` handles this transparently — it yields a single user message dict. All agent calls go through `run_agent()` which auto-detects whether streaming is needed.

### Inter-agent JSON protocol

Agents communicate exclusively via JSON files in the workspace directory:
- `product_spec.json` — full spec with design system, sprints, stack choice
- `feature_list.json` — flat array; builder sets `"passes": true` per feature
- `sprint_contract_N.json` — deliverables with verifiable test criteria
- `contract_review_N.json` — approved/rejected with feedback
- `qa_report_N.json` / `qa_report_final.json` — scored QA reports with bugs
- `progress.json` — cost/run tracking (managed by `ProjectProgress`)
- `claude-progress.txt` — human-readable timestamped log

Validation schemas for these files are defined in `tools.py:_REQUIRED_KEYS`.

## Conventions

- Python 3.10+, type annotations everywhere
- Async functions for all agent interactions
- Git commits: `feat(module): description`
- Agent prompts in `prompts/` are written in French
- All config (models, limits, security, budget, QA thresholds) lives in `config.yaml`
- Agents are stateless — each invocation starts fresh via `run_agent()`
