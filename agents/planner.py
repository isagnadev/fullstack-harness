"""Planner agent — transforms a user prompt into a product specification."""

from __future__ import annotations

import os
from pathlib import Path

from claude_code_sdk import ClaudeCodeOptions

from .client import AgentResult, run_agent
from security import create_permission_handler
from tools import create_harness_tools


_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


async def run_planner(
    user_prompt: str,
    config: dict,
    workspace_dir: str,
) -> AgentResult:
    """Run the planner agent to produce product_spec.json, feature_list.json, and init.sh.

    Parameters
    ----------
    user_prompt:
        The raw user request (1-4 sentences).
    config:
        Parsed config.yaml contents.
    workspace_dir:
        Absolute path to the project workspace directory.
    """
    system_prompt = (_PROMPTS_DIR / "planner_prompt.md").read_text(encoding="utf-8")
    agent_cfg = config["agent_limits"]["planner"]

    options = ClaudeCodeOptions(
        model=config["models"]["planner"],
        system_prompt=system_prompt,
        cwd=workspace_dir,
        max_turns=agent_cfg["max_turns"],
        permission_mode=agent_cfg["permission_mode"],
        allowed_tools=agent_cfg["allowed_tools"],
        mcp_servers={"harness": create_harness_tools(workspace_dir)},
        can_use_tool=create_permission_handler(config, workspace_dir),
    )

    # Build the full prompt with context
    stack_options = config.get("stack", {})
    full_prompt = f"""## User Request

{user_prompt}

## Context

- Your workspace is: {workspace_dir}
- Frontend stack: {stack_options.get('frontend', 'nextjs-tailwind')}
- Backend options: {', '.join(stack_options.get('backend_options', ['api-platform', 'fastapi']))}
- Database: {stack_options.get('database', 'sqlite')}

## Instructions

Produce exactly these 3 files in the workspace root:

1. **product_spec.json** — Full product specification with design system, sprints, and stack choice.
2. **feature_list.json** — Flat array of all features with IDs, sprint assignments, and `"passes": false`.
3. **init.sh** — Idempotent bash script to scaffold the project (directories, dependencies, configs).

Start by analyzing the user request, then design the product, then write the files.
"""

    return await run_agent(full_prompt, options)
