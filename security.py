"""Security module — Bash allowlist and filesystem confinement.

Provides a `can_use_tool` callback factory for the Claude Code SDK that
enforces command allowlists and workspace-scoped file access.
"""

from __future__ import annotations

import os
import re
import shlex

from claude_code_sdk import (
    PermissionResult,
    PermissionResultAllow,
    PermissionResultDeny,
    ToolPermissionContext,
)


def _extract_binary(command: str) -> str | None:
    """Extract the first real binary from a shell command.

    Handles:
      - Simple commands: ``npm install``
      - Env-prefixed commands: ``NODE_ENV=production npm start``
      - Piped commands: returns the first binary
    """
    try:
        tokens = shlex.split(command)
    except ValueError:
        return None
    if not tokens:
        return None

    # Skip KEY=VALUE env prefixes
    for token in tokens:
        if "=" in token and not token.startswith("-"):
            continue
        return os.path.basename(token)
    return None


def create_permission_handler(
    config: dict,
    workspace_dir: str,
) -> "CanUseToolCallback":
    """Return an async ``can_use_tool`` callback bound to *config* and *workspace_dir*.

    The callback enforces:
    1. Bash command allowlist — only binaries in ``config["security"]["bash_allowlist"]``
       are allowed.
    2. Bash deny patterns — commands matching any pattern in
       ``config["security"]["bash_denylist"]`` are blocked.
    3. Filesystem confinement — ``Write`` and ``Edit`` operations must target
       paths inside *workspace_dir*.
    """
    allowlist: set[str] = set(config["security"]["bash_allowlist"])
    deny_patterns: list[re.Pattern[str]] = [
        re.compile(re.escape(p)) for p in config["security"]["bash_denylist"]
    ]
    abs_workspace = os.path.realpath(workspace_dir)

    async def can_use_tool(
        tool_name: str,
        input_data: dict,
        context: ToolPermissionContext,
    ) -> PermissionResult:
        # --- Bash guard ---
        if tool_name == "Bash":
            command = input_data.get("command", "")
            binary = _extract_binary(command)
            if binary is None:
                return PermissionResultDeny(
                    message="Could not parse command — blocked for safety."
                )
            if binary not in allowlist:
                return PermissionResultDeny(
                    message=f"Binary '{binary}' is not in the allowlist."
                )
            for pat in deny_patterns:
                if pat.search(command):
                    return PermissionResultDeny(
                        message=f"Command matches deny pattern: {pat.pattern}"
                    )

        # --- Filesystem confinement for Write / Edit ---
        if tool_name in ("Write", "Edit"):
            file_path = input_data.get("file_path", "")
            real = os.path.realpath(file_path)
            if not real.startswith(abs_workspace + os.sep) and real != abs_workspace:
                return PermissionResultDeny(
                    message=f"Path '{file_path}' is outside workspace '{abs_workspace}'."
                )

        return PermissionResultAllow()

    return can_use_tool


# Type alias for documentation purposes.
CanUseToolCallback = type(create_permission_handler)
