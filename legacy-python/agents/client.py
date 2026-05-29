"""Shared agent runner — wraps ``claude_code_sdk.query()`` for every agent.

Key responsibility: handle the SDK constraint where ``can_use_tool`` requires
the prompt to be an ``AsyncIterable[dict]`` (streaming mode), not a plain
string.
"""

from __future__ import annotations

import logging
import os
import sys
import time
from collections.abc import AsyncIterable, AsyncIterator
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import anyio

from claude_code_sdk import (
    AssistantMessage,
    ClaudeCodeOptions,
    ResultMessage,
    TextBlock,
    query,
)
from claude_code_sdk._errors import MessageParseError

# ---------------------------------------------------------------------------
# Monkey-patch: SDK v0.0.25 raises on message types added in newer CLI
# versions (e.g. ``rate_limit_event``).  Patch ``parse_message`` so that
# unknown types are logged and returned as ``SystemMessage`` instead of
# raising, which would kill the async generator mid-flight.
# ---------------------------------------------------------------------------
import claude_code_sdk._internal.client as _sdk_client
import claude_code_sdk._internal.message_parser as _mp
from claude_code_sdk import SystemMessage

_original_parse_message = _mp.parse_message


def _patched_parse_message(data):
    try:
        return _original_parse_message(data)
    except MessageParseError:
        return SystemMessage(subtype=data.get("type", "unknown"), data=data)


# Patch both the module and the reference held by the SDK's internal client
_mp.parse_message = _patched_parse_message
_sdk_client.parse_message = _patched_parse_message

# ---------------------------------------------------------------------------
# Monkey-patch: raise the 1MB JSON buffer limit to 10MB.
# On later sprints the Builder can produce large responses (big files,
# long tool outputs) that exceed the default buffer.
# ---------------------------------------------------------------------------
import claude_code_sdk._internal.transport.subprocess_cli as _transport
_transport._MAX_BUFFER_SIZE = 10 * 1024 * 1024  # 10MB

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Streaming prompt wrapper (SDK workaround)
# ---------------------------------------------------------------------------

# How often to check if the CLI is idle (seconds).
_IDLE_CHECK_INTERVAL = 30
# If no message arrives for this long, assume the CLI is hung and close stdin.
_IDLE_TIMEOUT = 120


async def _wrap_prompt_as_stream(
    prompt: str,
    done: anyio.Event,
    last_activity: list[float],
) -> AsyncIterator[dict[str, Any]]:
    """Yield a single user message then hold stdin open until the agent finishes.

    The SDK closes stdin (``end_input``) as soon as this iterator is
    exhausted.  Stdin is also the channel for control-protocol responses
    (``can_use_tool``, MCP calls), so closing it too early kills the
    agent.  Closing it too late keeps the CLI alive after the agent is
    done (e.g. Playwright MCP not shutting down).

    Solution: poll *done* with short sleeps, and also check
    *last_activity* — a shared mutable timestamp updated by ``run_agent``
    on every received message.  If the CLI goes silent for
    ``_IDLE_TIMEOUT`` seconds, we return and let stdin close.
    """
    yield {
        "type": "user",
        "message": {"role": "user", "content": prompt},
        "parent_tool_use_id": None,
        "session_id": "default",
    }
    # Poll until done is set or the CLI goes idle.
    while not done.is_set():
        with anyio.move_on_after(_IDLE_CHECK_INTERVAL):
            await done.wait()
        if not done.is_set() and time.monotonic() - last_activity[0] > _IDLE_TIMEOUT:
            logger.warning(
                "CLI idle for %ds — forcing stdin close (MCP server likely hung)",
                _IDLE_TIMEOUT,
            )
            return


# ---------------------------------------------------------------------------
# Agent result
# ---------------------------------------------------------------------------

@dataclass
class AgentResult:
    """Structured result from a single agent invocation."""

    text_output: str
    cost_usd: float
    duration_ms: int
    num_turns: int
    is_error: bool
    session_id: str
    result_text: str | None = None  # ResultMessage.result if available


# ---------------------------------------------------------------------------
# Core runner
# ---------------------------------------------------------------------------

async def run_agent(
    prompt: str,
    options: ClaudeCodeOptions,
) -> AgentResult:
    """Run a single agent invocation and collect results.

    If ``options.can_use_tool`` is set the prompt is automatically wrapped
    into an ``AsyncIterable`` (streaming mode) as required by the SDK.
    """
    # Log CLI stderr to a file in the workspace for crash diagnosis.
    # Each run appends with a timestamp header so we can trace which invocation
    # produced the output.
    debug_log_path = os.path.join(options.cwd or ".", "cli_debug.log")
    debug_log = open(debug_log_path, "a", buffering=1)  # line-buffered
    debug_log.write(
        f"\n\n===== {datetime.now(timezone.utc).isoformat()} "
        f"model={options.model} cwd={options.cwd} =====\n"
    )
    options.extra_args["debug-to-stderr"] = None
    options.debug_stderr = debug_log

    # Determine prompt format
    done = anyio.Event()
    last_activity = [time.monotonic()]
    actual_prompt: str | AsyncIterable[dict[str, Any]]
    if options.can_use_tool is not None:
        actual_prompt = _wrap_prompt_as_stream(prompt, done, last_activity)
    else:
        actual_prompt = prompt

    text_parts: list[str] = []
    result_msg: ResultMessage | None = None
    start = time.monotonic()

    try:
        async for message in query(prompt=actual_prompt, options=options):
            last_activity[0] = time.monotonic()
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        text_parts.append(block.text)
            elif isinstance(message, ResultMessage):
                result_msg = message
                done.set()  # Signal the stream to close stdin
    except Exception:
        logger.exception("Agent execution failed")
        elapsed = int((time.monotonic() - start) * 1000)
        return AgentResult(
            text_output="\n".join(text_parts),
            cost_usd=0.0,
            duration_ms=elapsed,
            num_turns=0,
            is_error=True,
            session_id="",
        )

    if result_msg is None:
        elapsed = int((time.monotonic() - start) * 1000)
        return AgentResult(
            text_output="\n".join(text_parts),
            cost_usd=0.0,
            duration_ms=elapsed,
            num_turns=0,
            is_error=True,
            session_id="",
        )

    return AgentResult(
        text_output="\n".join(text_parts),
        cost_usd=result_msg.total_cost_usd or 0.0,
        duration_ms=result_msg.duration_ms,
        num_turns=result_msg.num_turns,
        is_error=result_msg.is_error,
        session_id=result_msg.session_id,
        result_text=result_msg.result,
    )
