"""Builder agent — implements features sprint by sprint."""

from __future__ import annotations

import json
import os
from pathlib import Path

from claude_code_sdk import ClaudeCodeOptions

from .client import AgentResult, run_agent
from security import create_permission_handler
from tools import create_harness_tools


_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


def _load_builder_options(config: dict, workspace_dir: str) -> ClaudeCodeOptions:
    """Build the shared ClaudeCodeOptions for both builder modes."""
    system_prompt = (_PROMPTS_DIR / "builder_prompt.md").read_text(encoding="utf-8")
    grading = (_PROMPTS_DIR / "grading_criteria.md").read_text(encoding="utf-8")
    agent_cfg = config["agent_limits"]["builder"]

    return ClaudeCodeOptions(
        model=config["models"]["builder"],
        system_prompt=system_prompt + "\n\n---\n\n" + grading,
        cwd=workspace_dir,
        max_turns=agent_cfg["max_turns"],
        permission_mode=agent_cfg["permission_mode"],
        allowed_tools=agent_cfg["allowed_tools"],
        mcp_servers={"harness": create_harness_tools(workspace_dir)},
        can_use_tool=create_permission_handler(config, workspace_dir),
    )


# ---------------------------------------------------------------------------
# Contract Negotiation Mode
# ---------------------------------------------------------------------------

async def run_builder_contract(
    sprint_num: int,
    config: dict,
    workspace_dir: str,
    evaluator_feedback: str | None = None,
) -> AgentResult:
    """Have the builder propose (or revise) a sprint contract.

    The builder reads ``product_spec.json`` and ``feature_list.json`` then
    writes ``sprint_contract_{sprint_num}.json``.
    """
    options = _load_builder_options(config, workspace_dir)

    feedback_section = ""
    if evaluator_feedback:
        feedback_section = f"""
## Evaluator Feedback on Previous Contract Proposal

The evaluator rejected your previous contract. Address these concerns:

{evaluator_feedback}
"""

    prompt = f"""## Mode: Sprint Contract Proposal

Sprint number: {sprint_num}

## Instructions

1. Read `product_spec.json` to understand the full product spec.
2. Read `feature_list.json` to identify which features belong to sprint {sprint_num}.
3. Read `claude-progress.txt` and `git log --oneline -20` for project context.
4. Propose a sprint contract by writing `sprint_contract_{sprint_num}.json`.

The contract must include:
- `sprint_id` and `sprint_name`
- `agreed_deliverables`: array of features with `feature`, `feature_id`, and `test_criteria`
- `out_of_scope`: what is NOT included
- `technical_approach`: 2-3 sentence summary

Make test criteria **specific and verifiable** (e.g., "clicking X opens Y", "API returns 201").
{feedback_section}"""

    return await run_agent(prompt, options)


# ---------------------------------------------------------------------------
# Implementation Mode
# ---------------------------------------------------------------------------

async def run_builder_implement(
    sprint_num: int,
    config: dict,
    workspace_dir: str,
    qa_feedback: str | None = None,
) -> AgentResult:
    """Have the builder implement (or fix) a sprint.

    The builder reads ``sprint_contract_{sprint_num}.json`` and produces
    working code, tests, commits, and progress updates.
    """
    options = _load_builder_options(config, workspace_dir)

    feedback_section = ""
    if qa_feedback:
        feedback_section = f"""
## QA Feedback to Address

The evaluator found issues in your previous implementation. Fix them:

{qa_feedback}
"""

    prompt = f"""## Mode: Sprint Implementation

Sprint number: {sprint_num}

## Sprint Protocol

Follow these steps IN ORDER:

1. `pwd` — verify you're in the right directory
2. Read `claude-progress.txt` for current project state
3. Read `git log --oneline -20` for recent history
4. Read `feature_list.json` — identify features for sprint {sprint_num}
5. Read `sprint_contract_{sprint_num}.json` for the agreed deliverables
6. Check if `init.sh` needs to be run (e.g., first sprint)
7. Verify existing features still work (run existing tests)
8. Implement the sprint deliverables

## Implementation Rules

- Work on ONE feature at a time
- Write unit tests for each endpoint/component
- Self-test before marking done (run tests, curl endpoints)
- Commit each feature: `git add -A && git commit -m "feat(module): description"`
- Update `feature_list.json`: set `"passes": true` for completed features
- Update `claude-progress.txt` with a sprint summary
- If a previous feature breaks, fix it BEFORE continuing
- NEVER delete or modify existing feature descriptions in feature_list.json
{feedback_section}"""

    return await run_agent(prompt, options)
