"""Shared agent runner — wraps ``claude_code_sdk.query()`` for every agent.

Key responsibility: handle the SDK constraint where ``can_use_tool`` requires
the prompt to be an ``AsyncIterable[dict]`` (streaming mode), not a plain
string.
"""

from __future__ import annotations

import logging
import time
from collections.abc import AsyncIterable, AsyncIterator
from dataclasses import dataclass
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

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Streaming prompt wrapper (SDK workaround)
# ---------------------------------------------------------------------------

async def _wrap_prompt_as_stream(
    prompt: str, done: anyio.Event,
) -> AsyncIterator[dict[str, Any]]:
    """Yield a single user message then hold stdin open until the agent finishes.

    The SDK closes stdin (``end_input``) as soon as this iterator is
    exhausted.  Stdin is also the channel for control-protocol responses
    (``can_use_tool``, MCP calls), so closing it too early kills the
    agent.  Closing it too late keeps the CLI alive after the agent is
    done.

    Solution: block on *done*, which ``run_agent`` sets once it receives
    the ``ResultMessage``.  That lets stdin close cleanly after all tool
    permission exchanges are finished.
    """
    yield {
        "type": "user",
        "message": {"role": "user", "content": prompt},
        "parent_tool_use_id": None,
        "session_id": "default",
    }
    # Hold the stream open until the result arrives.
    await done.wait()


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
    # Determine prompt format
    done = anyio.Event()
    actual_prompt: str | AsyncIterable[dict[str, Any]]
    if options.can_use_tool is not None:
        actual_prompt = _wrap_prompt_as_stream(prompt, done)
    else:
        actual_prompt = prompt

    text_parts: list[str] = []
    result_msg: ResultMessage | None = None
    start = time.monotonic()

    try:
        async for message in query(prompt=actual_prompt, options=options):
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
