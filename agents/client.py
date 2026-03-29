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

from claude_code_sdk import (
    AssistantMessage,
    ClaudeCodeOptions,
    ResultMessage,
    TextBlock,
    query,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Streaming prompt wrapper (SDK workaround)
# ---------------------------------------------------------------------------

async def _wrap_prompt_as_stream(prompt: str) -> AsyncIterator[dict[str, Any]]:
    """Yield a single user message dict — satisfies the SDK streaming requirement."""
    yield {
        "type": "user",
        "message": {"role": "user", "content": prompt},
        "parent_tool_use_id": None,
        "session_id": "default",
    }


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
    actual_prompt: str | AsyncIterable[dict[str, Any]]
    if options.can_use_tool is not None:
        actual_prompt = _wrap_prompt_as_stream(prompt)
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
