#!/usr/bin/env python3
"""Multi-agent orchestrator — sequences Planner → Builder ↔ Evaluator.

Usage::

    python orchestrator.py "Build a Trello clone with AI" [project-name]

The orchestrator runs three phases:
1. **Planning** — the Planner agent turns a user prompt into a product spec.
2. **Sprint loop** — Builder and Evaluator iterate on each sprint with
   contract negotiation, implementation, and QA.
3. **Final evaluation** — the Evaluator runs a comprehensive end-to-end test.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import sys
from pathlib import Path

import yaml

from agents.planner import run_planner
from agents.builder import run_builder_contract, run_builder_implement
from agents.evaluator import run_evaluator_review_contract, run_evaluator_qa
from progress import AgentRun, ProjectProgress, append_progress_log

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("orchestrator")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_config(path: str = "config.yaml") -> dict:
    """Load and return the YAML configuration."""
    with open(path, encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def _read_json(workspace: str, filename: str) -> dict | list | None:
    """Read a JSON file from the workspace, returning *None* on failure."""
    p = os.path.join(workspace, filename)
    if not os.path.exists(p):
        logger.warning("Expected file not found: %s", p)
        return None
    try:
        with open(p, encoding="utf-8") as fh:
            return json.load(fh)
    except json.JSONDecodeError:
        logger.error("Invalid JSON in %s", p)
        return None


# Dev server ports that agents may spawn during a sprint. Kept here rather than
# in config.yaml because it is a harness invariant, not a per-project tunable.
_DEV_SERVER_PORTS = ("3000", "3001", "8000", "8001")


def _cleanup_workspace_ports(workspace: str) -> None:
    """Kill any dev-server process listening on :3000/:3001/:8000/:8001 whose
    cwd lives inside *workspace*.

    This prevents zombies surviving across sprints (e.g. when an agent spawns a
    backgrounded ``uvicorn`` or ``next dev`` and its parent claude subprocess
    later dies). Processes outside the workspace — including the user's own dev
    servers for other projects — are deliberately left untouched.
    """
    abs_workspace = os.path.realpath(workspace)
    try:
        out = subprocess.run(
            ["lsof", "-tiTCP", "-sTCP:LISTEN",
             "-i:" + ",".join(_DEV_SERVER_PORTS)],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return

    pids = [p for p in out.stdout.split() if p.isdigit()]
    killed: list[str] = []
    for pid in pids:
        try:
            cwd = os.readlink(f"/proc/{pid}/cwd")
        except OSError:
            continue
        cwd_real = os.path.realpath(cwd)
        if cwd_real == abs_workspace or cwd_real.startswith(abs_workspace + os.sep):
            try:
                os.kill(int(pid), 15)  # SIGTERM
                killed.append(pid)
            except ProcessLookupError:
                pass

    if killed:
        logger.info("Cleaned up dev-server zombies: PIDs %s", ",".join(killed))
        append_progress_log(
            workspace,
            f"Cleaned up dev-server zombies: PIDs {','.join(killed)}",
        )


# ---------------------------------------------------------------------------
# Phase 1 — Planning
# ---------------------------------------------------------------------------

async def phase_planning(
    user_prompt: str,
    config: dict,
    workspace: str,
    progress: ProjectProgress,
) -> bool:
    """Run the planner agent.  Returns *True* on success."""
    logger.info("═══ PHASE 1: PLANNING ═══")
    append_progress_log(workspace, "Phase 1: Planning started")

    result = await run_planner(user_prompt, config, workspace)
    progress.add_run(AgentRun(
        agent="planner",
        phase="planning",
        cost_usd=result.cost_usd,
        duration_ms=result.duration_ms,
        num_turns=result.num_turns,
        success=not result.is_error,
    ))

    if result.is_error:
        logger.error("Planner agent failed")
        return False

    # Validate outputs
    required_files = ["product_spec.json", "feature_list.json", "init.sh"]
    for fname in required_files:
        if not os.path.exists(os.path.join(workspace, fname)):
            logger.error("Planner did not produce %s", fname)
            return False

    # Make init.sh executable and run it
    init_sh = os.path.join(workspace, "init.sh")
    os.chmod(init_sh, 0o755)
    logger.info("Running init.sh …")
    try:
        subprocess.run(
            ["bash", init_sh],
            cwd=workspace,
            check=True,
            capture_output=True,
            text=True,
            timeout=900,
        )
    except subprocess.CalledProcessError as exc:
        logger.error("init.sh failed:\n%s", exc.stderr)
        return False
    except subprocess.TimeoutExpired:
        logger.error("init.sh timed out after 900s")
        return False

    cost = result.cost_usd
    logger.info("Planning complete — cost: $%.4f", cost)
    append_progress_log(workspace, f"Phase 1: Planning complete (${cost:.4f})")
    return True


# ---------------------------------------------------------------------------
# Phase 2 — Sprint Loop
# ---------------------------------------------------------------------------

async def negotiate_contract(
    sprint_num: int,
    config: dict,
    workspace: str,
    progress: ProjectProgress,
) -> bool:
    """Negotiate a sprint contract between builder and evaluator.

    Returns *True* if a contract was agreed upon.
    """
    max_rounds = config["orchestration"]["contract_negotiation_rounds"]
    evaluator_feedback: str | None = None

    for round_num in range(1, max_rounds + 1):
        logger.info("  Contract negotiation round %d/%d", round_num, max_rounds)

        # Builder proposes
        b_result = await run_builder_contract(
            sprint_num, config, workspace, evaluator_feedback
        )
        progress.add_run(AgentRun(
            agent="builder",
            phase=f"sprint_{sprint_num}_contract_{round_num}",
            cost_usd=b_result.cost_usd,
            duration_ms=b_result.duration_ms,
            num_turns=b_result.num_turns,
            success=not b_result.is_error,
        ))

        contract = _read_json(workspace, f"sprint_contract_{sprint_num}.json")
        if contract is None:
            logger.warning("  Builder did not produce a contract file")
            continue

        # Evaluator reviews
        e_result = await run_evaluator_review_contract(sprint_num, config, workspace)
        progress.add_run(AgentRun(
            agent="evaluator",
            phase=f"sprint_{sprint_num}_review_{round_num}",
            cost_usd=e_result.cost_usd,
            duration_ms=e_result.duration_ms,
            num_turns=e_result.num_turns,
            success=not e_result.is_error,
        ))

        review = _read_json(workspace, f"contract_review_{sprint_num}.json")
        if review is None:
            logger.warning("  Evaluator did not produce a review file")
            continue

        if review.get("approved"):
            logger.info("  Contract approved ✓")
            return True

        evaluator_feedback = review.get("feedback", "") + "\n" + json.dumps(
            review.get("requested_changes", []), indent=2
        )
        logger.info("  Contract rejected — iterating")

    logger.warning("  Contract not approved after %d rounds — proceeding anyway", max_rounds)
    return False


async def run_sprint(
    sprint_num: int,
    config: dict,
    workspace: str,
    progress: ProjectProgress,
) -> bool:
    """Run a single sprint: negotiate → implement → QA.

    Returns *True* if the sprint passed QA.
    """
    logger.info("─── Sprint %d ───", sprint_num)
    append_progress_log(workspace, f"Sprint {sprint_num}: started")

    # Nuke any dev servers left behind by the previous sprint's agents.
    _cleanup_workspace_ports(workspace)

    # 1. Contract negotiation
    await negotiate_contract(sprint_num, config, workspace, progress)

    # 2. Implementation + QA loop
    max_retries = config["orchestration"]["max_retries_per_sprint"]
    qa_feedback: str | None = None
    qa_score = config["qa"]["min_score_global"]

    for attempt in range(1, max_retries + 1):
        logger.info("  Implementation attempt %d/%d", attempt, max_retries)

        # Builder implements
        b_result = await run_builder_implement(
            sprint_num, config, workspace, qa_feedback
        )
        progress.add_run(AgentRun(
            agent="builder",
            phase=f"sprint_{sprint_num}_build_{attempt}",
            cost_usd=b_result.cost_usd,
            duration_ms=b_result.duration_ms,
            num_turns=b_result.num_turns,
            success=not b_result.is_error,
        ))

        if b_result.is_error:
            logger.warning("  Builder agent errored — retrying")
            continue

        # Evaluator QA
        e_result = await run_evaluator_qa(sprint_num, config, workspace)
        progress.add_run(AgentRun(
            agent="evaluator",
            phase=f"sprint_{sprint_num}_qa_{attempt}",
            cost_usd=e_result.cost_usd,
            duration_ms=e_result.duration_ms,
            num_turns=e_result.num_turns,
            success=not e_result.is_error,
        ))

        report = _read_json(workspace, f"qa_report_{sprint_num}.json")
        if report is None:
            logger.warning("  Evaluator did not produce QA report")
            continue

        score = report.get("overall_score", 0)
        verdict = report.get("verdict", "FAIL")
        logger.info("  QA score: %.1f/10 — %s", score, verdict)

        if verdict == "PASS" and score >= qa_score:
            append_progress_log(
                workspace,
                f"Sprint {sprint_num}: PASSED (score {score:.1f})",
            )
            return True

        # Build feedback string for the builder
        bugs = report.get("bugs", [])
        feedback_parts = [report.get("feedback", "")]
        for bug in bugs:
            feedback_parts.append(
                f"- [{bug.get('severity', 'unknown')}] {bug.get('description', '')}"
                f" (file: {bug.get('file', '?')}, line: {bug.get('line', '?')})"
                f" → Fix: {bug.get('suggested_fix', 'N/A')}"
            )
        qa_feedback = "\n".join(feedback_parts)
        logger.info("  QA failed — sending feedback to builder")

    logger.warning("  Sprint %d failed after %d attempts — skipping", sprint_num, max_retries)
    append_progress_log(
        workspace,
        f"Sprint {sprint_num}: SKIPPED after {max_retries} failed attempts",
    )
    return False


async def phase_sprints(
    config: dict,
    workspace: str,
    progress: ProjectProgress,
) -> None:
    """Run all sprints from the product spec."""
    logger.info("═══ PHASE 2: SPRINT LOOP ═══")

    spec = _read_json(workspace, "product_spec.json")
    if spec is None or "sprints" not in spec:
        logger.error("Cannot read sprints from product_spec.json")
        return

    sprints = spec["sprints"]
    max_sprints = config["orchestration"]["max_sprints"]
    budget_max = config["budget"]["max_total_usd"]

    # If a previous run left failed sprints, stop immediately — the user must
    # review and either retry (remove from failed_sprints) or give up.
    if progress.failed_sprints:
        logger.error(
            "Previous run has failed sprints: %s. Review them and edit "
            "progress.json (remove from failed_sprints + lower current_sprint) "
            "to retry, then relaunch.",
            progress.failed_sprints,
        )
        return

    for sprint in sprints[:max_sprints]:
        sprint_num = sprint["id"]

        # Skip already completed sprints
        if sprint_num <= progress.current_sprint:
            logger.info("─── Sprint %d (skipped — already done) ───", sprint_num)
            continue

        # Budget check
        if progress.is_over_budget(budget_max):
            logger.warning(
                "Budget exceeded ($%.2f / $%.2f) — stopping",
                progress.total_cost_usd,
                budget_max,
            )
            break

        passed = await run_sprint(sprint_num, config, workspace, progress)
        progress.current_sprint = sprint_num

        if not passed:
            progress.failed_sprints.append(sprint_num)
            progress.save(workspace)
            logger.error(
                "  Sprint %d FAILED after all retries — stopping pipeline. "
                "Cumulative cost: $%.2f",
                sprint_num,
                progress.total_cost_usd,
            )
            append_progress_log(workspace, f"Sprint {sprint_num}: FAILED — pipeline stopped")
            return

        progress.save(workspace)
        logger.info(
            "  Sprint %d PASSED — cumulative cost: $%.2f",
            sprint_num,
            progress.total_cost_usd,
        )


# ---------------------------------------------------------------------------
# Phase 3 — Final Evaluation
# ---------------------------------------------------------------------------

async def phase_final_evaluation(
    config: dict,
    workspace: str,
    progress: ProjectProgress,
) -> None:
    """Run the final end-to-end evaluation."""
    logger.info("═══ PHASE 3: FINAL EVALUATION ═══")
    append_progress_log(workspace, "Phase 3: Final evaluation started")

    result = await run_evaluator_qa(0, config, workspace)  # sprint 0 = final
    progress.add_run(AgentRun(
        agent="evaluator",
        phase="final_evaluation",
        cost_usd=result.cost_usd,
        duration_ms=result.duration_ms,
        num_turns=result.num_turns,
        success=not result.is_error,
    ))

    report = _read_json(workspace, "qa_report_final.json")
    if report:
        score = report.get("overall_score", 0)
        coverage = report.get("feature_coverage", "?")
        logger.info("Final score: %.1f/10 — Feature coverage: %s%%", score, coverage)
    else:
        logger.warning("Final evaluation did not produce a report")

    append_progress_log(workspace, "Phase 3: Final evaluation complete")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main(user_prompt: str, project_name: str) -> None:
    """Top-level orchestration entry point."""
    config = load_config(
        os.path.join(os.path.dirname(__file__), "config.yaml")
    )

    workspace = os.path.abspath(
        os.path.join(config["project"]["workspace"], project_name)
    )
    os.makedirs(workspace, exist_ok=True)

    # Initialize git if not already done
    if not os.path.exists(os.path.join(workspace, ".git")):
        subprocess.run(["git", "init"], cwd=workspace, check=True, capture_output=True)

    progress = ProjectProgress.load(workspace)
    progress.project_name = project_name

    logger.info("Project: %s", project_name)
    logger.info("Workspace: %s", workspace)
    logger.info("Budget: $%.2f", config["budget"]["max_total_usd"])
    logger.info("")

    # Phase 1: Planning — skip if outputs already exist
    required_files = ["product_spec.json", "feature_list.json", "init.sh"]
    if all(os.path.exists(os.path.join(workspace, f)) for f in required_files):
        logger.info("═══ PHASE 1: PLANNING (skipped — already done) ═══")
    else:
        ok = await phase_planning(user_prompt, config, workspace, progress)
        progress.save(workspace)
        if not ok:
            logger.error("Planning failed — aborting")
            sys.exit(1)

    try:
        # Phase 2: Sprint loop
        await phase_sprints(config, workspace, progress)
        progress.save(workspace)

        # Phase 3: Final evaluation — skip if report already exists
        if os.path.exists(os.path.join(workspace, "qa_report_final.json")):
            logger.info("═══ PHASE 3: FINAL EVALUATION (skipped — already done) ═══")
        else:
            await phase_final_evaluation(config, workspace, progress)
            progress.save(workspace)
    finally:
        # Always clean up dev-server zombies, even on Ctrl+C or crash.
        _cleanup_workspace_ports(workspace)

    # Summary
    logger.info("")
    logger.info("═══ SUMMARY ═══")
    logger.info("Sprints completed: %d", progress.current_sprint)
    logger.info("Total runs: %d", len(progress.runs))
    logger.info("Total cost: $%.2f", progress.total_cost_usd)
    logger.info("Workspace: %s", workspace)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python orchestrator.py <user-prompt> [project-name]")
        sys.exit(1)

    user_prompt = sys.argv[1]
    project_name = sys.argv[2] if len(sys.argv) > 2 else "default"

    try:
        asyncio.run(main(user_prompt, project_name))
    except BaseException as exc:
        logger.exception("Orchestrator crashed: %s", exc)
        sys.exit(1)
