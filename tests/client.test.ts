/**
 * DX-14 — diagnostic des échecs du runner d'agent (src/agents/client.ts).
 *
 * Le SDK est mocké : on vérifie que chaque chemin d'échec écrit une ligne
 * préfixée distincte dans cli_debug.log ([runAgent ABORT] / [runAgent
 * EXCEPTION] / [runAgent NO_RESULT]) ET que les objets de retour restent
 * strictement identiques à la V1 (isError: true, costUsd: 0, ...).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: vi.fn() }));

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Options } from "@anthropic-ai/claude-agent-sdk";

import {
  formatDebugLine,
  formatNoResult,
  formatRunFailure,
  runAgent,
} from "../src/agents/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type QueryReturn = ReturnType<typeof query>;

/** Fait retourner par `query()` un générateur asynchrone arbitraire. */
function mockQueryWith(
  gen: (options: Options) => AsyncGenerator<unknown>,
): void {
  vi.mocked(query).mockImplementation(
    (args) =>
      gen((args as { options: Options }).options) as unknown as QueryReturn,
  );
}

function assistantText(text: string): unknown {
  return { type: "assistant", message: { content: [{ type: "text", text }] } };
}

/** Champs V1 attendus à l'identique sur TOUT chemin d'erreur du runner. */
const V1_ERROR_FIELDS = {
  costUsd: 0,
  numTurns: 0,
  isError: true,
  sessionId: "",
  resultText: null,
} as const;

// ---------------------------------------------------------------------------
// Formatage pur des messages de diagnostic
// ---------------------------------------------------------------------------

describe("formatRunFailure", () => {
  it("préfixe [runAgent ABORT] et mentionne le watchdog quand aborted=true", () => {
    const msg = formatRunFailure(new Error("AbortError"), true);
    expect(msg).toMatch(/^\[runAgent ABORT\]/);
    expect(msg).toMatch(/watchdog idle-timeout/);
    expect(msg).toContain("AbortError");
  });

  it("préfixe [runAgent EXCEPTION] avec la stack quand aborted=false", () => {
    const err = new Error("boom SDK");
    const msg = formatRunFailure(err, false);
    expect(msg).toMatch(/^\[runAgent EXCEPTION\]/);
    expect(msg).toContain(err.stack);
  });

  it("retombe sur err.message quand la stack est absente", () => {
    const err = new Error("no stack here");
    err.stack = undefined;
    const msg = formatRunFailure(err, false);
    expect(msg).toMatch(/^\[runAgent EXCEPTION\]/);
    expect(msg).toContain("no stack here");
  });

  it("stringifie les valeurs non-Error", () => {
    expect(formatRunFailure("plain string failure", false)).toContain(
      "plain string failure",
    );
    expect(formatRunFailure(42, true)).toContain("42");
  });

  it("distingue abort et exception pour une même erreur", () => {
    const err = new Error("same cause");
    expect(formatRunFailure(err, true)).not.toBe(formatRunFailure(err, false));
  });
});

describe("formatNoResult", () => {
  it("préfixe [runAgent NO_RESULT] et inclut la durée en ms", () => {
    const msg = formatNoResult(1234);
    expect(msg).toMatch(/^\[runAgent NO_RESULT\]/);
    expect(msg).toContain("1234ms");
    expect(msg).toMatch(/result/);
  });
});

describe("formatDebugLine", () => {
  it("produit une ligne datée ISO, encadrée de sauts de ligne", () => {
    const now = new Date("2026-07-11T10:20:30.000Z");
    expect(formatDebugLine("hello", now)).toBe(
      "\n[2026-07-11T10:20:30.000Z] hello\n",
    );
  });
});

// ---------------------------------------------------------------------------
// runAgent — chemins d'échec et de succès (SDK mocké)
// ---------------------------------------------------------------------------

describe("runAgent (SDK mocké)", () => {
  let tmp: string;

  beforeEach(() => {
    vi.mocked(query).mockReset();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dx14-client-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function readDebugLog(): string {
    return fs.readFileSync(path.join(tmp, "cli_debug.log"), "utf-8");
  }

  const options = (): Options => ({ cwd: tmp, model: "test-model" } as Options);

  it("exception SDK : ligne [runAgent EXCEPTION] + objet de retour V1 inchangé", async () => {
    mockQueryWith(async function* () {
      throw new Error("boom SDK");
    });

    const res = await runAgent("go", options());

    expect(res).toMatchObject(V1_ERROR_FIELDS);
    expect(res.textOutput).toBe("");
    expect(typeof res.durationMs).toBe("number");

    const log = readDebugLog();
    expect(log).toContain("[runAgent EXCEPTION]");
    expect(log).toContain("boom SDK");
    expect(log).not.toContain("[runAgent ABORT]");
    expect(log).not.toContain("[runAgent NO_RESULT]");
  });

  it("abort du watchdog : ligne [runAgent ABORT] + objet de retour V1 inchangé", async () => {
    mockQueryWith(async function* (opts) {
      // Simule le watchdog : l'AbortController fourni par runAgent est
      // déclenché, puis l'itération rejette (comme le ferait le SDK).
      opts.abortController?.abort();
      throw new Error("This operation was aborted");
    });

    const res = await runAgent("go", options());

    expect(res).toMatchObject(V1_ERROR_FIELDS);

    const log = readDebugLog();
    expect(log).toContain("[runAgent ABORT]");
    expect(log).toContain("watchdog idle-timeout");
    expect(log).not.toContain("[runAgent EXCEPTION]");
  });

  it("stream sans message result : ligne [runAgent NO_RESULT] + objet V1 inchangé", async () => {
    mockQueryWith(async function* () {
      yield assistantText("partial output");
    });

    const res = await runAgent("go", options());

    expect(res).toMatchObject(V1_ERROR_FIELDS);
    expect(res.textOutput).toBe("partial output");

    const log = readDebugLog();
    expect(log).toContain("[runAgent NO_RESULT]");
    expect(log).not.toContain("[runAgent ABORT]");
    expect(log).not.toContain("[runAgent EXCEPTION]");
  });

  it("succès : mapping du ResultMessage inchangé et AUCUNE ligne [runAgent ...]", async () => {
    mockQueryWith(async function* () {
      yield assistantText("hello");
      yield {
        type: "result",
        subtype: "success",
        total_cost_usd: 1.25,
        duration_ms: 456,
        num_turns: 7,
        is_error: false,
        session_id: "sess-1",
        result: "done",
      };
    });

    const res = await runAgent("go", options());

    expect(res).toEqual({
      textOutput: "hello",
      costUsd: 1.25,
      durationMs: 456,
      numTurns: 7,
      isError: false,
      sessionId: "sess-1",
      resultText: "done",
    });

    const log = readDebugLog();
    expect(log).toContain("====="); // en-tête d'invocation existant
    expect(log).not.toContain("[runAgent");
  });
});
