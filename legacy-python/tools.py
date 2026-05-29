"""Custom MCP tools exposed to agents via an in-process server.

The factory :func:`create_harness_tools` returns a ``McpSdkServerConfig``
that can be passed to ``ClaudeCodeOptions.mcp_servers``.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

from claude_code_sdk import SdkMcpTool, create_sdk_mcp_server

# ---------------------------------------------------------------------------
# JSON schemas used by the ``validate_json`` tool
# ---------------------------------------------------------------------------

_REQUIRED_KEYS: dict[str, list[str]] = {
    "product_spec": ["name", "description", "design_system", "sprints", "stack"],
    "feature_list_item": ["id", "sprint", "category", "description", "passes"],
    "sprint_contract": ["sprint_id", "sprint_name", "agreed_deliverables"],
    "qa_report": ["sprint_id", "overall_score", "verdict", "scores", "bugs"],
    "contract_review": ["sprint_id", "approved", "feedback"],
}


# ---------------------------------------------------------------------------
# Tool handlers (defined at module level, workspace_dir injected later)
# ---------------------------------------------------------------------------

def _make_update_progress(workspace_dir: str):
    """Return an ``update_progress`` handler bound to *workspace_dir*."""

    async def handler(args: dict[str, Any]) -> dict[str, Any]:
        phase = args.get("phase", "unknown")
        message = args.get("message", "")
        path = os.path.join(workspace_dir, "claude-progress.txt")
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        line = f"[{ts}] [{phase}] {message}\n"
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(line)
        return {"content": [{"type": "text", "text": f"Progress updated: {line.strip()}"}]}

    return handler


def _make_validate_json(workspace_dir: str):
    """Return a ``validate_json`` handler bound to *workspace_dir*."""

    async def handler(args: dict[str, Any]) -> dict[str, Any]:
        file_path = args.get("file_path", "")
        schema_name = args.get("schema_name", "")

        # Resolve relative to workspace
        abs_path = os.path.join(workspace_dir, file_path) if not os.path.isabs(file_path) else file_path

        if not os.path.exists(abs_path):
            return {
                "content": [{"type": "text", "text": f"File not found: {abs_path}"}],
                "is_error": True,
            }

        try:
            with open(abs_path, encoding="utf-8") as fh:
                data = json.load(fh)
        except json.JSONDecodeError as exc:
            return {
                "content": [{"type": "text", "text": f"Invalid JSON: {exc}"}],
                "is_error": True,
            }

        # If it's a list schema (feature_list), validate each item
        if schema_name == "feature_list":
            if not isinstance(data, list):
                return {
                    "content": [{"type": "text", "text": "feature_list must be a JSON array"}],
                    "is_error": True,
                }
            item_keys = _REQUIRED_KEYS.get("feature_list_item", [])
            errors = []
            for i, item in enumerate(data):
                missing = [k for k in item_keys if k not in item]
                if missing:
                    errors.append(f"Item {i}: missing keys {missing}")
            if errors:
                return {
                    "content": [{"type": "text", "text": "Validation errors:\n" + "\n".join(errors)}],
                    "is_error": True,
                }
            return {"content": [{"type": "text", "text": f"Valid feature_list with {len(data)} items."}]}

        # Single-object schemas
        required = _REQUIRED_KEYS.get(schema_name)
        if required is None:
            return {
                "content": [{"type": "text", "text": f"Unknown schema: {schema_name}. "
                             f"Available: {', '.join(_REQUIRED_KEYS.keys())}"}],
                "is_error": True,
            }

        if not isinstance(data, dict):
            return {
                "content": [{"type": "text", "text": f"{schema_name} must be a JSON object"}],
                "is_error": True,
            }

        missing = [k for k in required if k not in data]
        if missing:
            return {
                "content": [{"type": "text", "text": f"Missing required keys: {missing}"}],
                "is_error": True,
            }

        return {"content": [{"type": "text", "text": f"Valid {schema_name}."}]}

    return handler


# ---------------------------------------------------------------------------
# Public factory
# ---------------------------------------------------------------------------

def create_harness_tools(workspace_dir: str):
    """Build an in-process MCP server with harness-specific tools.

    Returns a config object suitable for ``ClaudeCodeOptions.mcp_servers["harness"]``.
    """
    update_progress_tool = SdkMcpTool(
        name="update_progress",
        description="Append a timestamped progress entry to claude-progress.txt",
        input_schema={
            "type": "object",
            "properties": {
                "phase": {
                    "type": "string",
                    "description": "Current phase (e.g. 'sprint_1_build', 'planning')",
                },
                "message": {
                    "type": "string",
                    "description": "Progress message to log",
                },
            },
            "required": ["phase", "message"],
        },
        handler=_make_update_progress(workspace_dir),
    )

    validate_json_tool = SdkMcpTool(
        name="validate_json",
        description=(
            "Validate a JSON file against a known schema. "
            "Available schemas: product_spec, feature_list, sprint_contract, qa_report, contract_review."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to the JSON file (relative to workspace or absolute)",
                },
                "schema_name": {
                    "type": "string",
                    "description": "Schema to validate against",
                    "enum": list(_REQUIRED_KEYS.keys()) + ["feature_list"],
                },
            },
            "required": ["file_path", "schema_name"],
        },
        handler=_make_validate_json(workspace_dir),
    )

    return create_sdk_mcp_server(
        name="harness",
        version="1.0.0",
        tools=[update_progress_tool, validate_json_tool],
    )
