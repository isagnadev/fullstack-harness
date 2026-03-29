# Fullstack Harness — Multi-Agent Development System

## What this is

An orchestrator that runs 3 Claude Opus 4.6 agents (Planner, Builder, Evaluator) to build full-stack web applications autonomously. Agents communicate via JSON files on disk.

## Project structure

```
orchestrator.py          — Main entry point, sequences all phases
config.yaml              — Models, thresholds, security, budget
agents/client.py         — Shared query() wrapper (handles SDK streaming constraint)
agents/planner.py        — Agent 1: user prompt → product spec
agents/builder.py        — Agent 2: implements code sprint-by-sprint
agents/evaluator.py      — Agent 3: QA testing with Playwright + unit tests
security.py              — Bash allowlist + filesystem confinement
tools.py                 — Custom MCP tools (progress tracking, JSON validation)
progress.py              — Cost tracking and run history
prompts/                 — System prompts for each agent
```

## How to run

```bash
# Install dependencies
pip install -r requirements.txt

# Run the orchestrator
python orchestrator.py "Build a Trello clone with AI" my-project

# Output goes to workspace/my-project/
```

## Key SDK constraint

`can_use_tool` requires the prompt to be `AsyncIterable[dict]`, not a string. The wrapper in `agents/client.py:_wrap_prompt_as_stream()` handles this transparently.

## Commands

- **Run**: `python orchestrator.py "<prompt>" [project-name]`
- **Validate config**: `python -c "import yaml; yaml.safe_load(open('config.yaml'))"`
- **Check imports**: `python -c "from agents.client import run_agent; from agents.planner import run_planner; print('OK')"`

## Conventions

- Python 3.10+, type annotations everywhere
- Async functions for all agent interactions
- JSON files for inter-agent communication (never in-memory state)
- Git commits follow conventional format: `feat(module): description`
- Agents are stateless — each invocation starts fresh via `query()`
