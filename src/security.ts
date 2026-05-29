/**
 * Module de sécurité — allowlist Bash et confinement filesystem.
 *
 * Fournit une fabrique de callback `can_use_tool` pour le SDK Claude Agent qui
 * impose des allowlists de commandes et un accès fichier limité au workspace.
 *
 * Port fidèle de la V1 Python (`security.py`).
 */

import path from "node:path";

import type { CanUseTool, PermissionResult } from "@anthropic-ai/claude-agent-sdk";

import type { Config } from "./types";

const SEGMENT_SPLIT_RE = /&&|\|\||;|\||\n/;

/**
 * Découpe une commande shell en segments de premier niveau.
 *
 * Découpe sur ``&&``, ``||``, ``;``, ``|`` et les retours à la ligne. Le quoting
 * shell n'est pas pris en compte — un segment coupé à l'intérieur de quotes serait
 * mal détecté mais échoue tout de même en sécurité car chaque moitié est re-validée.
 */
function splitSegments(command: string): string[] {
  return command
    .split(SEGMENT_SPLIT_RE)
    .map((seg) => seg.trim())
    .filter((seg) => seg.length > 0);
}

/**
 * Équivalent minimal de Python ``shlex.split`` : gère les espaces, les quotes
 * simples ``'...'`` et doubles ``"..."``. Renvoie ``[]`` si une quote n'est pas fermée.
 */
function shlexSplit(s: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let hasToken = false;
  let quote: '"' | "'" | null = null;
  let i = 0;

  while (i < s.length) {
    const ch = s[i] as string;

    if (quote !== null) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      hasToken = true;
      i += 1;
      continue;
    }

    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v") {
      if (hasToken) {
        tokens.push(current);
        current = "";
        hasToken = false;
      }
      i += 1;
      continue;
    }

    current += ch;
    hasToken = true;
    i += 1;
  }

  if (quote !== null) {
    // Quote non fermée — équivalent du ValueError de shlex.
    return [];
  }

  if (hasToken) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Extrait le binaire effectif d'un seul segment.
 *
 * Gère :
 *   - Commandes simples : ``npm install``
 *   - Commandes préfixées d'env : ``NODE_ENV=production npm start``
 */
function segmentBinary(segment: string): string | null {
  const tokens = shlexSplit(segment);
  if (tokens.length === 0) {
    return null;
  }
  for (const token of tokens) {
    if (token.includes("=") && !token.startsWith("-")) {
      continue;
    }
    return path.basename(token);
  }
  return null;
}

/** Renvoie les tokens non-flag d'un segment (chemins filesystem candidats). */
function extractPaths(segment: string): string[] {
  const tokens = shlexSplit(segment);
  return tokens.slice(1).filter((t) => !t.startsWith("-") && !t.includes("="));
}

/** Renvoie *true* ssi ``p`` se résout à l'intérieur de ``root``. */
function isInside(p: string, root: string): boolean {
  const real = path.resolve(p);
  return real === root || real.startsWith(root + path.sep);
}

/**
 * Renvoie un callback async ``can_use_tool`` lié à *config* et *workspaceDir*.
 *
 * Le callback impose :
 * 1. **Allowlist de commandes Bash** — chaque segment d'une commande chaînée doit
 *    utiliser un binaire listé dans ``config.security.bash_allowlist``.
 * 2. **Patterns de refus Bash** — les commandes correspondant à un pattern de
 *    ``config.security.bash_denylist`` sont bloquées.
 * 3. **Confinement de chemins Bash** — tout ``cd <path>`` doit cibler un répertoire
 *    à l'intérieur de *workspaceDir*, et aucun segment ne peut référencer un chemin
 *    absolu hors du workspace.
 * 4. **Confinement filesystem pour Write / Edit / Read** — ``file_path`` doit se
 *    résoudre à l'intérieur de *workspaceDir*.
 */
export function createPermissionHandler(config: Config, workspaceDir: string): CanUseTool {
  const allowlist = new Set<string>(config.security.bash_allowlist);
  const denyPatterns: RegExp[] = config.security.bash_denylist.map(
    (p) => new RegExp(escapeRegExp(p)),
  );
  const absWorkspace = path.resolve(workspaceDir);

  function validateBash(command: string): PermissionResult | null {
    for (const pat of denyPatterns) {
      if (pat.test(command)) {
        return {
          behavior: "deny",
          message: `Command matches deny pattern: ${pat.source}`,
        };
      }
    }

    const segments = splitSegments(command);
    if (segments.length === 0) {
      return {
        behavior: "deny",
        message: "Empty command — blocked for safety.",
      };
    }

    // Suit le cwd effectif à travers les segments ``cd`` chaînés.
    let effectiveCwd = absWorkspace;

    for (const segment of segments) {
      const binary = segmentBinary(segment);
      if (binary === null) {
        return {
          behavior: "deny",
          message: `Could not parse segment '${segment}' — blocked.`,
        };
      }
      if (!allowlist.has(binary)) {
        return {
          behavior: "deny",
          message: `Binary '${binary}' is not in the allowlist (segment: '${segment}').`,
        };
      }

      // Vérifications de confinement de chemins — refuse tout argument chemin
      // qui se résout hors du workspace (pas seulement les siblings).
      for (const candidatePath of extractPaths(segment)) {
        // Ne s'intéresse qu'aux chemins qui ressemblent à des références filesystem.
        if (
          !(
            candidatePath === ".." ||
            candidatePath.startsWith("/") ||
            candidatePath.startsWith("./") ||
            candidatePath.startsWith("../") ||
            candidatePath.includes("/")
          )
        ) {
          continue;
        }
        const candidate = path.isAbsolute(candidatePath)
          ? candidatePath
          : path.join(effectiveCwd, candidatePath);
        if (!isInside(candidate, absWorkspace)) {
          return {
            behavior: "deny",
            message: `Path '${candidatePath}' resolves outside workspace '${absWorkspace}'.`,
          };
        }
      }

      // Si le segment est un ``cd``, met à jour effectiveCwd pour les segments
      // suivants de la chaîne et refuse de sortir du workspace.
      if (binary === "cd") {
        const tokens = shlexSplit(segment);
        // ``cd`` sans argument retourne à $HOME — refuse.
        if (tokens.length < 2) {
          return {
            behavior: "deny",
            message: "Bare 'cd' is not allowed (would leave workspace).",
          };
        }
        const target = tokens[1] as string;
        const newCwd = path.isAbsolute(target) ? target : path.join(effectiveCwd, target);
        if (!isInside(newCwd, absWorkspace)) {
          return {
            behavior: "deny",
            message: `'cd ${target}' would leave workspace '${absWorkspace}'.`,
          };
        }
        effectiveCwd = path.resolve(newCwd);
      }
    }

    return null;
  }

  const canUseTool: CanUseTool = async (toolName, input, _options) => {
    // --- Garde Bash ---
    if (toolName === "Bash") {
      const command = input.command === undefined ? "" : String(input.command);
      const deny = validateBash(command);
      if (deny !== null) {
        return deny;
      }
    }

    // --- Confinement filesystem pour Read / Write / Edit ---
    if (toolName === "Read" || toolName === "Write" || toolName === "Edit") {
      const filePath = input.file_path === undefined ? "" : String(input.file_path);
      if (!isInside(filePath, absWorkspace)) {
        return {
          behavior: "deny",
          message: `Path '${filePath}' is outside workspace '${absWorkspace}'.`,
        };
      }
    }

    // --- Confinement filesystem pour Glob / Grep (paramètre path) ---
    if (toolName === "Glob" || toolName === "Grep") {
      const searchPath = input.path === undefined ? "" : String(input.path);
      if (searchPath && !isInside(searchPath, absWorkspace)) {
        return {
          behavior: "deny",
          message: `Search path '${searchPath}' is outside workspace '${absWorkspace}'.`,
        };
      }
    }

    return { behavior: "allow" };
  };

  return canUseTool;
}

/** Échappe les métacaractères regex (équivalent de Python ``re.escape``). */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
