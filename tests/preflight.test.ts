import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cliDebugLogHint,
  preflight,
  runPreflightChecks,
} from "../src/preflight";
import type { CommandProbe, CommandRunner } from "../src/preflight";
import type { Config } from "../src/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeConfig(playwright: boolean): Config {
  return {
    qa: {
      min_score_global: 8,
      min_score_per_criterion: 7.0,
      tools: { playwright, unit_tests: true, curl: true },
    },
  } as unknown as Config;
}

const OK: CommandProbe = { status: 0 };
const ENOENT: CommandProbe = {
  error: Object.assign(new Error("spawnSync claude ENOENT"), { code: "ENOENT" }),
  status: null,
};
const NON_ZERO: CommandProbe = { status: 1 };

interface RecordedCall {
  cmd: string;
  args: string[];
  timeoutMs: number;
}

/** Faux runner de commande : retourne un résultat pré-programmé par binaire. */
function makeRunner(byCmd: Record<string, CommandProbe>): {
  runner: CommandRunner;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const runner: CommandRunner = (cmd, args, timeoutMs) => {
    calls.push({ cmd, args, timeoutMs });
    return byCmd[cmd] ?? OK;
  };
  return { runner, calls };
}

const ENV_WITH_KEY = { ANTHROPIC_API_KEY: "sk-ant-test" };

// ---------------------------------------------------------------------------
// runPreflightChecks — pure logic
// ---------------------------------------------------------------------------

describe("runPreflightChecks", () => {
  it("reports no problem when claude works, the key is set and playwright is available", () => {
    const { runner } = makeRunner({ claude: OK, npx: OK });
    const report = runPreflightChecks(makeConfig(true), ENV_WITH_KEY, runner);
    expect(report.fatal).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it("is fatal when the claude CLI is missing (ENOENT), naming 'claude' and the remedy", () => {
    const { runner } = makeRunner({ claude: ENOENT, npx: OK });
    const report = runPreflightChecks(makeConfig(true), ENV_WITH_KEY, runner);
    expect(report.fatal).toHaveLength(1);
    expect(report.fatal[0]).toMatch(/claude/);
    expect(report.fatal[0]).toMatch(/@anthropic-ai\/claude-code/);
    expect(report.warnings).toEqual([]);
  });

  it("is fatal when 'claude --version' exits non-zero", () => {
    const { runner } = makeRunner({ claude: NON_ZERO, npx: OK });
    const report = runPreflightChecks(makeConfig(true), ENV_WITH_KEY, runner);
    expect(report.fatal).toHaveLength(1);
    expect(report.fatal[0]).toMatch(/claude/);
  });

  it.each([
    ["absent", {}],
    ["empty", { ANTHROPIC_API_KEY: "" }],
    ["whitespace", { ANTHROPIC_API_KEY: "   " }],
  ])(
    "emits a NON-blocking warning when ANTHROPIC_API_KEY is %s",
    (_label, env) => {
      const { runner } = makeRunner({ claude: OK, npx: OK });
      const report = runPreflightChecks(makeConfig(true), env, runner);
      expect(report.fatal).toEqual([]);
      expect(report.warnings).toHaveLength(1);
      expect(report.warnings[0]).toMatch(/ANTHROPIC_API_KEY/);
      expect(report.warnings[0]).toMatch(/session/i);
    },
  );

  it("emits a NON-blocking warning when @playwright/mcp is unavailable and qa.tools.playwright=true", () => {
    const { runner } = makeRunner({ claude: OK, npx: NON_ZERO });
    const report = runPreflightChecks(makeConfig(true), ENV_WITH_KEY, runner);
    expect(report.fatal).toEqual([]);
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toMatch(/@playwright\/mcp/);
  });

  it("skips the playwright probe when qa.tools.playwright=false", () => {
    const { runner, calls } = makeRunner({ claude: OK, npx: NON_ZERO });
    const report = runPreflightChecks(makeConfig(false), ENV_WITH_KEY, runner);
    expect(report.warnings).toEqual([]);
    expect(calls.map((c) => c.cmd)).not.toContain("npx");
  });

  it("accumulates ALL detected problems instead of stopping at the first one", () => {
    const { runner } = makeRunner({ claude: ENOENT, npx: ENOENT });
    const report = runPreflightChecks(makeConfig(true), {}, runner);
    expect(report.fatal).toHaveLength(1);
    expect(report.warnings).toHaveLength(2);
  });

  it("probes with bounded timeouts and npx --no-install (no download, no API call)", () => {
    const { runner, calls } = makeRunner({ claude: OK, npx: OK });
    runPreflightChecks(makeConfig(true), ENV_WITH_KEY, runner);

    const claudeCall = calls.find((c) => c.cmd === "claude");
    expect(claudeCall?.args).toEqual(["--version"]);
    expect(claudeCall?.timeoutMs).toBeLessThanOrEqual(5000);

    const npxCall = calls.find((c) => c.cmd === "npx");
    expect(npxCall?.args).toContain("--no-install");
    expect(npxCall?.args).toContain("@playwright/mcp");
    expect(npxCall?.timeoutMs).toBeLessThanOrEqual(15000);
  });
});

// ---------------------------------------------------------------------------
// preflight — wrapper fail-fast
// ---------------------------------------------------------------------------

describe("preflight", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws an explicit error listing every fatal problem when claude is missing", () => {
    const { runner } = makeRunner({ claude: ENOENT, npx: OK });
    expect(() => preflight(makeConfig(true), ENV_WITH_KEY, runner)).toThrow(
      /claude/,
    );
    expect(() => preflight(makeConfig(true), ENV_WITH_KEY, runner)).toThrow(
      /@anthropic-ai\/claude-code/,
    );
  });

  it("does NOT throw on warnings only, and prints them via console.warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { runner } = makeRunner({ claude: OK, npx: NON_ZERO });

    expect(() => preflight(makeConfig(true), {}, runner)).not.toThrow();

    const warned = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(warned).toMatch(/ANTHROPIC_API_KEY/);
    expect(warned).toMatch(/@playwright\/mcp/);
  });

  it("passes silently when everything is available", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { runner } = makeRunner({ claude: OK, npx: OK });

    expect(() => preflight(makeConfig(true), ENV_WITH_KEY, runner)).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// cliDebugLogHint — pointeur vers la stderr CLI capturée
// ---------------------------------------------------------------------------

describe("cliDebugLogHint", () => {
  it("returns the ABSOLUTE path of <workspace>/cli_debug.log", () => {
    const hint = cliDebugLogHint("./workspace/mon-projet");
    expect(hint).toContain(
      path.resolve("./workspace/mon-projet", "cli_debug.log"),
    );
  });

  it("keeps an already-absolute workspace path unchanged", () => {
    const hint = cliDebugLogHint("/tmp/ws/proj");
    expect(hint).toContain(path.join("/tmp/ws/proj", "cli_debug.log"));
  });
});
