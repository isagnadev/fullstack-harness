/**
 * Preflight — vérification des prérequis d'environnement AVANT la Phase 1.
 *
 * Divergence assumée vs V1 (DX-15) : la V1 Python lance la pipeline sans
 * vérifier ses prérequis ; un CLI `claude` absent (ou une auth manquante) ne se
 * manifeste qu'après ~120 s de watchdog d'inactivité (client.ts:IDLE_TIMEOUT_MS)
 * par un générique `isError: true`, la vraie erreur étant enfouie dans
 * `<workspace>/cli_debug.log`. Le preflight attrape ces erreurs en quelques ms,
 * liste TOUS les problèmes détectés (sans s'arrêter au premier), et s'exécute
 * avant tout effet de bord (mkdir workspace, git init). Il n'effectue AUCUN
 * appel API payant — uniquement des `spawnSync` locaux et des lectures d'env.
 * Le watchdog et la convention `isError`/`cost_usd = 0` du runner restent
 * inchangés (limitations V1 volontairement préservées) : le preflight les
 * contourne en amont sans les modifier.
 */

import { spawnSync } from "node:child_process";
import * as path from "node:path";

import type { Config } from "./types";

// ---------------------------------------------------------------------------
// Abstraction d'exécution de commande (injectable pour les tests)
// ---------------------------------------------------------------------------

/** Résultat minimal d'une sonde de commande locale. */
export interface CommandProbe {
  /** Erreur de spawn (ex. ENOENT si le binaire est introuvable). */
  error?: Error;
  /** Code de sortie du process, `null` si le spawn a échoué. */
  status: number | null;
}

/** Exécuteur de commande injectable — `spawnSync` en production. */
export type CommandRunner = (
  cmd: string,
  args: string[],
  timeoutMs: number,
) => CommandProbe;

/** Timeout de la sonde `claude --version` (le check doit rester quasi instantané). */
const CLAUDE_PROBE_TIMEOUT_MS = 5_000;
/** Timeout de la sonde `npx --no-install @playwright/mcp` (npx peut être lent). */
const PLAYWRIGHT_PROBE_TIMEOUT_MS = 15_000;

/** Runner par défaut : `spawnSync` avec timeout borné, sans shell. */
function spawnSyncRunner(
  cmd: string,
  args: string[],
  timeoutMs: number,
): CommandProbe {
  const out = spawnSync(cmd, args, { encoding: "utf-8", timeout: timeoutMs });
  return { error: out.error, status: out.status };
}

// ---------------------------------------------------------------------------
// Checks — logique pure (testable unitairement)
// ---------------------------------------------------------------------------

/** Problèmes détectés par le preflight, séparés par gravité. */
export interface PreflightReport {
  /** Problèmes bloquants — la pipeline ne peut pas fonctionner. */
  fatal: string[];
  /** Problèmes non bloquants — la pipeline peut fonctionner en dégradé. */
  warnings: string[];
}

/**
 * Agrège tous les checks de prérequis sans s'arrêter au premier échec.
 *
 * - CLI `claude` introuvable/défaillant → FATAL (1re invocation SDK vouée à
 *   l'échec après 120 s de watchdog).
 * - `ANTHROPIC_API_KEY` absent/vide → WARNING seulement : le SDK peut
 *   fonctionner via une session CLI active.
 * - `@playwright/mcp` indisponible alors que `qa.tools.playwright: true` →
 *   WARNING seulement : Playwright n'est utilisé qu'en Phase 2/3 (QA), pas au
 *   planning.
 */
export function runPreflightChecks(
  config: Config,
  env: Record<string, string | undefined>,
  runCommand: CommandRunner = spawnSyncRunner,
): PreflightReport {
  const fatal: string[] = [];
  const warnings: string[] = [];

  // 1. CLI claude — indispensable à toute invocation d'agent.
  const claude = runCommand("claude", ["--version"], CLAUDE_PROBE_TIMEOUT_MS);
  if (claude.error !== undefined || claude.status !== 0) {
    fatal.push(
      "'claude' CLI not found in PATH (or 'claude --version' failed) — " +
        "install it with: npm install -g @anthropic-ai/claude-code",
    );
  }

  // 2. Authentification — clé absente ≠ échec : une session CLI active suffit.
  if ((env["ANTHROPIC_API_KEY"] ?? "").trim() === "") {
    warnings.push(
      "ANTHROPIC_API_KEY is not set — the harness will rely on an active " +
        "Claude CLI session; make sure 'claude' is logged in",
    );
  }

  // 3. Playwright MCP — utilisé seulement par l'evaluator en mode QA.
  if (config.qa.tools.playwright === true) {
    const playwright = runCommand(
      "npx",
      ["--no-install", "@playwright/mcp", "--version"],
      PLAYWRIGHT_PROBE_TIMEOUT_MS,
    );
    if (playwright.error !== undefined || playwright.status !== 0) {
      warnings.push(
        "@playwright/mcp is not available ('npx --no-install @playwright/mcp " +
          "--version' failed) — Playwright QA (qa.tools.playwright: true) will " +
          "fail at the first QA run; preinstall it, e.g. " +
          "'pnpm add -D @playwright/mcp' then 'pnpm dlx playwright install'",
      );
    }
  }

  return { fatal, warnings };
}

// ---------------------------------------------------------------------------
// Point d'entrée fail-fast
// ---------------------------------------------------------------------------

/**
 * Exécute le preflight : affiche les warnings, et lève une erreur explicite
 * listant TOUS les problèmes bloquants détectés.
 *
 * À appeler dans `main()` juste après `loadConfig()`, avant la création du
 * workspace et le `git init` — aucun effet de bord si le preflight échoue.
 */
export function preflight(
  config: Config,
  env: Record<string, string | undefined> = process.env,
  runCommand: CommandRunner = spawnSyncRunner,
): void {
  const report = runPreflightChecks(config, env, runCommand);

  for (const warning of report.warnings) {
    console.warn(`[preflight] WARNING: ${warning}`);
  }

  if (report.fatal.length > 0) {
    throw new Error(
      `Preflight failed — ${report.fatal.length} blocking problem(s) detected:\n` +
        report.fatal.map((problem) => `  - ${problem}`).join("\n"),
    );
  }
}

// ---------------------------------------------------------------------------
// Diagnostic post-échec d'agent
// ---------------------------------------------------------------------------

/**
 * Message pointant vers la stderr CLI capturée (`<workspace>/cli_debug.log`),
 * seul endroit où la cause réelle d'un `isError` apparaît (ex. crash CLI).
 *
 * Helper centralisé (DX-15) : à logger sur chaque site `result.isError` de
 * l'orchestrateur pour raccourcir le diagnostic.
 */
export function cliDebugLogHint(workspace: string): string {
  return `See CLI details: ${path.resolve(workspace, "cli_debug.log")}`;
}
