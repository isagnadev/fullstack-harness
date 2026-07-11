/**
 * Runner d'agent partagé — encapsule `query()` du SDK pour chaque agent.
 *
 * Runner-A : prompt sous forme de string + watchdog via AbortController.
 * Les monkey-patches Python (parse_message, buffer 1MB) n'ont pas d'équivalent
 * ici ; on reproduit uniquement le comportement observable.
 */

import { appendFileSync } from "node:fs";
import { join } from "node:path";

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Options, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";

// ---------------------------------------------------------------------------
// Constantes du watchdog
// ---------------------------------------------------------------------------

/** Si aucun message n'arrive pendant cette durée (ms), on coupe l'agent. */
const IDLE_TIMEOUT_MS = 120_000;
/** Intervalle de vérification de l'inactivité (ms). */
const IDLE_CHECK_INTERVAL_MS = 5_000;

// ---------------------------------------------------------------------------
// Résultat d'agent
// ---------------------------------------------------------------------------

export interface AgentResult {
  textOutput: string;
  costUsd: number;
  durationMs: number;
  numTurns: number;
  isError: boolean;
  sessionId: string;
  resultText: string | null;
}

// ---------------------------------------------------------------------------
// Diagnostic des échecs (DX-14) — formatage pur, testé unitairement.
// Logging additif uniquement : les objets de retour de runAgent restent
// strictement identiques à la V1 (isError: true, costUsd: 0, ...).
// ---------------------------------------------------------------------------

/**
 * Ligne datée pour cli_debug.log. Format volontairement distinct de
 * l'en-tête d'invocation `=====` pour éviter toute confusion à la lecture.
 */
export function formatDebugLine(msg: string, now: Date): string {
  return `\n[${now.toISOString()}] ${msg}\n`;
}

/**
 * Message diagnostique du chemin d'exception de runAgent : distingue l'abort
 * du watchdog d'inactivité (le `for await` rejette après `controller.abort()`)
 * d'un crash réel du SDK/CLI — deux causes auparavant indistinguables.
 */
export function formatRunFailure(err: unknown, aborted: boolean): string {
  if (aborted) {
    return (
      `[runAgent ABORT] watchdog idle-timeout ` +
      `(>${IDLE_TIMEOUT_MS / 1000}s) — ${String(err)}`
    );
  }
  return `[runAgent EXCEPTION] ${
    err instanceof Error ? (err.stack ?? err.message) : String(err)
  }`;
}

/**
 * Message diagnostique du chemin « stream terminé proprement mais sans
 * message `result` » — sémantiquement distinct d'une exception.
 */
export function formatNoResult(durationMs: number): string {
  return (
    `[runAgent NO_RESULT] stream terminé sans message 'result' ` +
    `(durée ${durationMs}ms)`
  );
}

// ---------------------------------------------------------------------------
// Runner principal
// ---------------------------------------------------------------------------

export async function runAgent(
  prompt: string,
  options: Options,
): Promise<AgentResult> {
  // Log de la stderr du CLI dans un fichier du workspace pour diagnostic de crash.
  // Chaque run ajoute un en-tête horodaté afin de tracer l'invocation.
  const debugLogPath = join(options.cwd ?? ".", "cli_debug.log");
  appendFileSync(
    debugLogPath,
    `\n\n===== ${new Date().toISOString()} ` +
      `model=${options.model} cwd=${options.cwd} =====\n`,
  );

  // Trace diagnostique datée dans cli_debug.log (DX-14).
  const logDebug = (msg: string): void => {
    appendFileSync(debugLogPath, formatDebugLine(msg, new Date()));
  };

  const controller = new AbortController();
  const finalOptions: Options = {
    ...options,
    settingSources: [],
    strictMcpConfig: true,
    abortController: controller,
    stderr: (data: string): void => {
      appendFileSync(debugLogPath, data);
    },
  };

  // Watchdog : surveille l'inactivité du CLI.
  let lastActivity = Date.now();
  const idle = setInterval(() => {
    if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
      clearInterval(idle);
      controller.abort();
    }
  }, IDLE_CHECK_INTERVAL_MS);
  idle.unref?.();

  const start = Date.now();
  const q = query({ prompt, options: finalOptions });
  const textParts: string[] = [];
  let resultMsg: SDKResultMessage | null = null;

  try {
    for await (const msg of q) {
      lastActivity = Date.now();
      switch (msg.type) {
        case "assistant":
          for (const block of msg.message.content) {
            if (block.type === "text") {
              textParts.push(block.text);
            }
          }
          break;
        case "result":
          resultMsg = msg;
          break;
        default:
          continue;
      }
    }
  } catch (err) {
    // Abort ou crash -> isError true. On loggue la cause (DX-14) sans rien
    // changer aux valeurs de retour (fidélité V1 : costUsd = 0).
    logDebug(formatRunFailure(err, controller.signal.aborted));
    // BORNE BASSE (DX-20) : le coût des tours déjà facturés avant
    // l'abort/crash est perdu (pas de ResultMessage). total_cost_usd
    // sous-estimera le coût réel ; cf. progress.addRun et isOverBudget.
    return {
      textOutput: textParts.join("\n"),
      costUsd: 0,
      durationMs: Date.now() - start,
      numTurns: 0,
      isError: true,
      sessionId: "",
      resultText: null,
    };
  } finally {
    clearInterval(idle);
  }

  if (resultMsg === null) {
    logDebug(formatNoResult(Date.now() - start));
    // BORNE BASSE (DX-20) : le coût des tours déjà facturés avant le crash
    // est perdu (pas de ResultMessage). total_cost_usd sous-estimera le
    // coût réel ; cf. progress.addRun et isOverBudget.
    return {
      textOutput: textParts.join("\n"),
      costUsd: 0,
      durationMs: Date.now() - start,
      numTurns: 0,
      isError: true,
      sessionId: "",
      resultText: null,
    };
  }

  return {
    textOutput: textParts.join("\n"),
    costUsd: resultMsg.total_cost_usd ?? 0,
    durationMs: resultMsg.duration_ms,
    numTurns: resultMsg.num_turns,
    isError: resultMsg.is_error,
    sessionId: resultMsg.session_id,
    resultText: resultMsg.subtype === "success" ? resultMsg.result : null,
  };
}
