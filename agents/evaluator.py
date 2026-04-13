"""Evaluator (QA) agent — tests the builder's work and produces scored reports."""

from __future__ import annotations

import os
from pathlib import Path

from claude_code_sdk import ClaudeCodeOptions

from .client import AgentResult, run_agent
from security import create_permission_handler
from tools import create_harness_tools


_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


def _load_evaluator_options(
    config: dict,
    workspace_dir: str,
    *,
    with_playwright: bool = False,
) -> ClaudeCodeOptions:
    """Build the shared ClaudeCodeOptions for both evaluator modes."""
    system_prompt = (_PROMPTS_DIR / "evaluator_prompt.md").read_text(encoding="utf-8")
    grading = (_PROMPTS_DIR / "grading_criteria.md").read_text(encoding="utf-8")
    agent_cfg = config["agent_limits"]["evaluator"]

    mcp_servers: dict = {"harness": create_harness_tools(workspace_dir)}
    allowed_tools = list(agent_cfg["allowed_tools"])

    if with_playwright and config.get("qa", {}).get("tools", {}).get("playwright"):
        mcp_servers["playwright"] = {
            "type": "stdio",
            "command": "npx",
            "args": ["@playwright/mcp", "--headless"],
        }
        # Allow all playwright tools
        allowed_tools.append("mcp__playwright__*")

    return ClaudeCodeOptions(
        model=config["models"]["evaluator"],
        system_prompt=system_prompt + "\n\n---\n\n" + grading,
        cwd=workspace_dir,
        max_turns=agent_cfg["max_turns"],
        permission_mode=agent_cfg["permission_mode"],
        allowed_tools=allowed_tools,
        mcp_servers=mcp_servers,
        can_use_tool=create_permission_handler(config, workspace_dir),
    )


# ---------------------------------------------------------------------------
# Contract Review Mode
# ---------------------------------------------------------------------------

async def run_evaluator_review_contract(
    sprint_num: int,
    config: dict,
    workspace_dir: str,
) -> AgentResult:
    """Have the evaluator review a sprint contract.

    Reads ``sprint_contract_{sprint_num}.json`` and writes
    ``contract_review_{sprint_num}.json``.
    """
    options = _load_evaluator_options(config, workspace_dir, with_playwright=False)

    prompt = f"""## Mode: Contract Review

Sprint number: {sprint_num}

## Instructions

1. Read `product_spec.json` to understand the full product spec.
2. Read `feature_list.json` to see which features belong to sprint {sprint_num}.
3. Read `sprint_contract_{sprint_num}.json` — the builder's proposed contract.

## Review Criteria

Check that:
- Test criteria are **specific and verifiable** (not vague like "UI looks good")
- Scope is **realistic** for a single sprint
- Deliverables cover **all features** assigned to this sprint in product_spec.json
- `out_of_scope` is **explicit** and reasonable
- `technical_approach` is sound

## Output

Write `contract_review_{sprint_num}.json` with:
- `sprint_id`: {sprint_num}
- `approved`: true/false
- `feedback`: detailed comments
- `requested_changes`: array of changes (if approved=false)

Be constructive but rigorous. Approve if the contract is solid. Reject if test
criteria are vague, scope is unrealistic, or features are missing.
"""

    return await run_agent(prompt, options)


# ---------------------------------------------------------------------------
# QA Testing Mode
# ---------------------------------------------------------------------------

async def run_evaluator_qa(
    sprint_num: int,
    config: dict,
    workspace_dir: str,
) -> AgentResult:
    """Have the evaluator run full QA on a sprint implementation.

    Uses Playwright MCP for browser testing, plus unit tests and curl.
    Writes ``qa_report_{sprint_num}.json`` (or ``qa_report_final.json``
    when *sprint_num* is 0).
    """
    options = _load_evaluator_options(config, workspace_dir, with_playwright=True)

    qa_config = config.get("qa", {})
    min_global = qa_config.get("min_score_global", 8.0)
    min_criterion = qa_config.get("min_score_per_criterion", 7.0)

    report_name = (
        "qa_report_final.json" if sprint_num == 0
        else f"qa_report_{sprint_num}.json"
    )

    mode_label = "Final Evaluation" if sprint_num == 0 else f"Sprint {sprint_num} QA"
    scope_instructions = ""
    if sprint_num == 0:
        scope_instructions = """
## Final Evaluation Scope

This is the FINAL evaluation of the entire application.
1. Read `product_spec.json` and `feature_list.json`
2. Test EVERY feature marked `"passes": true`
3. Test cross-cutting flows (auth → navigation → action → result)
4. Include `"feature_coverage"` in the report: % of features that actually pass
"""
    else:
        scope_instructions = f"""
## Sprint Scope

Test ONLY the deliverables in `sprint_contract_{sprint_num}.json`.
Also verify that previously passing features haven't regressed.
"""

    prompt = f"""## Mode: {mode_label}

{scope_instructions}

## Testing Protocol

### a) Browser Tests (Playwright)
- Navigate the app as a real user
- Click every button, fill every form
- Take screenshots for visual verification
- Test responsive viewports (375px mobile, 1280px desktop)
- Test complete end-to-end flows

### b) Programmatic Tests
- Run unit tests: `npm test` / `pytest` / `phpunit`
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

- **PASS**: weighted score >= {min_global} AND every criterion >= {min_criterion}
- **FAIL**: otherwise

## Output

Write `{report_name}` with the full QA report structure including:
scores, bugs (with file, line, reproduction steps, suggested fix),
tests_run counts, feedback summary, and screenshots.

**Be SKEPTICAL.** Test like a real user, not a developer. Never approve
a sprint where a core feature is broken.
"""

    return await run_agent(prompt, options)
