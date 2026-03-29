"""Progress tracking and cost accounting for harness runs."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone


@dataclass
class AgentRun:
    """Record of a single agent invocation."""

    agent: str          # "planner", "builder", "evaluator"
    phase: str          # e.g. "planning", "sprint_1_contract", "sprint_1_build_0"
    cost_usd: float
    duration_ms: int
    num_turns: int
    success: bool
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class ProjectProgress:
    """Aggregate progress and cost tracking across all runs."""

    project_name: str
    runs: list[AgentRun] = field(default_factory=list)
    current_sprint: int = 0
    total_cost_usd: float = 0.0

    # ------------------------------------------------------------------
    # Mutators
    # ------------------------------------------------------------------

    def add_run(self, run: AgentRun) -> None:
        self.runs.append(run)
        self.total_cost_usd += run.cost_usd

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def is_over_budget(self, max_usd: float) -> bool:
        return self.total_cost_usd >= max_usd

    def sprint_cost(self, sprint_num: int) -> float:
        return sum(
            r.cost_usd for r in self.runs if f"sprint_{sprint_num}" in r.phase
        )

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def save(self, workspace_dir: str) -> None:
        """Write ``progress.json`` into *workspace_dir*."""
        path = os.path.join(workspace_dir, "progress.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(asdict(self), fh, indent=2, ensure_ascii=False)

    @classmethod
    def load(cls, workspace_dir: str) -> ProjectProgress:
        """Load from ``progress.json`` or return a blank instance."""
        path = os.path.join(workspace_dir, "progress.json")
        if not os.path.exists(path):
            return cls(project_name="unknown")
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        runs = [AgentRun(**r) for r in data.get("runs", [])]
        return cls(
            project_name=data.get("project_name", "unknown"),
            runs=runs,
            current_sprint=data.get("current_sprint", 0),
            total_cost_usd=data.get("total_cost_usd", 0.0),
        )


def append_progress_log(workspace_dir: str, message: str) -> None:
    """Append a timestamped line to ``claude-progress.txt``."""
    path = os.path.join(workspace_dir, "claude-progress.txt")
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(f"[{ts}] {message}\n")
