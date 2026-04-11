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


_SEGMENT_SPLIT_RE = re.compile(r"&&|\|\||;|\||\n")


def _split_segments(command: str) -> list[str]:
    """Split a shell command into top-level segments.

    Splits on ``&&``, ``||``, ``;``, ``|``, and newlines. Shell quoting is not
    considered — a segment split inside quotes would mis-detect but still fails
    safely because each half is re-validated.
    """
    return [seg.strip() for seg in _SEGMENT_SPLIT_RE.split(command) if seg.strip()]


def _segment_binary(segment: str) -> str | None:
    """Extract the effective binary from a single segment.

    Handles:
      - Simple commands: ``npm install``
      - Env-prefixed commands: ``NODE_ENV=production npm start``
    """
    try:
        tokens = shlex.split(segment)
    except ValueError:
        return None
    if not tokens:
        return None
    for token in tokens:
        if "=" in token and not token.startswith("-"):
            continue
        return os.path.basename(token)
    return None


def _extract_paths(segment: str) -> list[str]:
    """Return non-flag tokens from a segment (candidate filesystem paths)."""
    try:
        tokens = shlex.split(segment)
    except ValueError:
        return []
    return [t for t in tokens[1:] if not t.startswith("-") and "=" not in t]


def _is_inside(path: str, root: str) -> bool:
    """Return *True* iff ``path`` resolves inside ``root``."""
    real = os.path.realpath(path)
    return real == root or real.startswith(root + os.sep)


def create_permission_handler(
    config: dict,
    workspace_dir: str,
) -> "CanUseToolCallback":
    """Return an async ``can_use_tool`` callback bound to *config* and *workspace_dir*.

    The callback enforces:
    1. **Bash command allowlist** — every segment of a chained command must use
       a binary listed in ``config["security"]["bash_allowlist"]``.
    2. **Bash deny patterns** — commands matching any pattern in
       ``config["security"]["bash_denylist"]`` are blocked.
    3. **Bash path confinement** — any ``cd <path>`` must target a directory
       inside *workspace_dir*, and no segment may reference an absolute path
       under another workspace sibling (e.g. a different project).
    4. **Filesystem confinement for Write / Edit** — ``file_path`` must resolve
       inside *workspace_dir*.
    """
    allowlist: set[str] = set(config["security"]["bash_allowlist"])
    deny_patterns: list[re.Pattern[str]] = [
        re.compile(re.escape(p)) for p in config["security"]["bash_denylist"]
    ]
    abs_workspace = os.path.realpath(workspace_dir)
    # Parent workspace root (e.g. ``.../workspace/``) — used to detect attempts
    # to reach sibling projects. If the current workspace is already the top of
    # the filesystem, this degrades gracefully to the workspace itself.
    siblings_root = os.path.dirname(abs_workspace) or abs_workspace

    def _validate_bash(command: str) -> PermissionResult | None:
        """Return a Deny result if *command* is rejected, else ``None``."""
        for pat in deny_patterns:
            if pat.search(command):
                return PermissionResultDeny(
                    message=f"Command matches deny pattern: {pat.pattern}"
                )

        segments = _split_segments(command)
        if not segments:
            return PermissionResultDeny(
                message="Empty command — blocked for safety."
            )

        # Track the effective cwd across chained ``cd`` segments.
        effective_cwd = abs_workspace

        for segment in segments:
            binary = _segment_binary(segment)
            if binary is None:
                return PermissionResultDeny(
                    message=f"Could not parse segment '{segment}' — blocked."
                )
            if binary not in allowlist:
                return PermissionResultDeny(
                    message=(
                        f"Binary '{binary}' is not in the allowlist "
                        f"(segment: '{segment}')."
                    )
                )

            # Path-confinement checks.
            for path in _extract_paths(segment):
                # Only bother with paths that look like filesystem references.
                if not (path.startswith("/") or path.startswith("./")
                        or path.startswith("../") or "/" in path):
                    continue
                candidate = path if os.path.isabs(path) else os.path.join(
                    effective_cwd, path
                )
                # Reject references that land inside another sibling workspace
                # (same parent as our workspace but a different leaf).
                if _is_inside(candidate, siblings_root) and not _is_inside(
                    candidate, abs_workspace
                ):
                    return PermissionResultDeny(
                        message=(
                            f"Path '{path}' targets another workspace sibling "
                            f"outside '{abs_workspace}'."
                        )
                    )

            # If the segment is a ``cd``, update effective_cwd for subsequent
            # segments in the same chain and refuse leaves out of the workspace.
            if binary == "cd":
                tokens = shlex.split(segment)
                # ``cd`` with no arg returns to $HOME — refuse.
                if len(tokens) < 2:
                    return PermissionResultDeny(
                        message="Bare 'cd' is not allowed (would leave workspace)."
                    )
                target = tokens[1]
                new_cwd = target if os.path.isabs(target) else os.path.join(
                    effective_cwd, target
                )
                if not _is_inside(new_cwd, abs_workspace):
                    return PermissionResultDeny(
                        message=(
                            f"'cd {target}' would leave workspace "
                            f"'{abs_workspace}'."
                        )
                    )
                effective_cwd = os.path.realpath(new_cwd)

        return None

    async def can_use_tool(
        tool_name: str,
        input_data: dict,
        context: ToolPermissionContext,
    ) -> PermissionResult:
        # --- Bash guard ---
        if tool_name == "Bash":
            command = input_data.get("command", "")
            deny = _validate_bash(command)
            if deny is not None:
                return deny

        # --- Filesystem confinement for Write / Edit ---
        if tool_name in ("Write", "Edit"):
            file_path = input_data.get("file_path", "")
            if not _is_inside(file_path, abs_workspace):
                return PermissionResultDeny(
                    message=f"Path '{file_path}' is outside workspace '{abs_workspace}'."
                )

        return PermissionResultAllow()

    return can_use_tool


# Type alias for documentation purposes.
CanUseToolCallback = type(create_permission_handler)
