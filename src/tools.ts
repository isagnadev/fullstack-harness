/**
 * Outils MCP personnalisés exposés aux agents via un serveur in-process.
 *
 * La fabrique `createHarnessTools` retourne une config `McpSdkServerConfigWithInstance`
 * passable à `Options.mcpServers`.
 */

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import {
  createSdkMcpServer,
  tool,
  type McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schémas JSON utilisés par l'outil `validate_json`
// ---------------------------------------------------------------------------

export const REQUIRED_KEYS: Record<string, string[]> = {
  product_spec: ["name", "description", "design_system", "sprints", "stack"],
  feature_list_item: ["id", "sprint", "category", "description", "passes"],
  sprint_contract: ["sprint_id", "sprint_name", "agreed_deliverables"],
  qa_report: ["sprint_id", "overall_score", "verdict", "scores", "bugs"],
  contract_review: ["sprint_id", "approved", "feedback"],
};

// ---------------------------------------------------------------------------
// Logique pure de validation (reproduction du handler validate_json Python)
// ---------------------------------------------------------------------------

export function validateJson(
  workspaceDir: string,
  filePath: string,
  schemaName: string,
): { content: { type: "text"; text: string }[]; isError?: boolean } {
  // Résolution relative au workspace
  const absPath = isAbsolute(filePath) ? filePath : join(workspaceDir, filePath);

  if (!existsSync(absPath)) {
    return {
      content: [{ type: "text", text: `File not found: ${absPath}` }],
      isError: true,
    };
  }

  let data: unknown;
  try {
    const raw = readFileSync(absPath, { encoding: "utf-8" });
    data = JSON.parse(raw);
  } catch (exc) {
    const message = exc instanceof Error ? exc.message : String(exc);
    return {
      content: [{ type: "text", text: `Invalid JSON: ${message}` }],
      isError: true,
    };
  }

  // S'il s'agit d'un schéma de liste (feature_list), valider chaque item
  if (schemaName === "feature_list") {
    if (!Array.isArray(data)) {
      return {
        content: [{ type: "text", text: "feature_list must be a JSON array" }],
        isError: true,
      };
    }
    const itemKeys = REQUIRED_KEYS["feature_list_item"] ?? [];
    const errors: string[] = [];
    data.forEach((item, i) => {
      const isObject = typeof item === "object" && item !== null && !Array.isArray(item);
      const record = isObject ? (item as Record<string, unknown>) : {};
      const missing = itemKeys.filter((k) => !(k in record));
      if (missing.length > 0) {
        errors.push(`Item ${i}: missing keys [${missing.map((k) => `'${k}'`).join(", ")}]`);
      }
    });
    if (errors.length > 0) {
      return {
        content: [{ type: "text", text: "Validation errors:\n" + errors.join("\n") }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: `Valid feature_list with ${data.length} items.` }],
    };
  }

  // Schémas objet unique
  const required = REQUIRED_KEYS[schemaName];
  if (required === undefined) {
    return {
      content: [
        {
          type: "text",
          text: `Unknown schema: ${schemaName}. Available: ${Object.keys(REQUIRED_KEYS).join(", ")}`,
        },
      ],
      isError: true,
    };
  }

  const isObject = typeof data === "object" && data !== null && !Array.isArray(data);
  if (!isObject) {
    return {
      content: [{ type: "text", text: `${schemaName} must be a JSON object` }],
      isError: true,
    };
  }

  const record = data as Record<string, unknown>;
  const missing = required.filter((k) => !(k in record));
  if (missing.length > 0) {
    return {
      content: [
        { type: "text", text: `Missing required keys: [${missing.map((k) => `'${k}'`).join(", ")}]` },
      ],
      isError: true,
    };
  }

  return { content: [{ type: "text", text: `Valid ${schemaName}.` }] };
}

// ---------------------------------------------------------------------------
// Horodatage UTC au format "%Y-%m-%d %H:%M:%S UTC" (comme Python)
// ---------------------------------------------------------------------------

function utcTimestamp(): string {
  const iso = new Date().toISOString(); // ex: 2026-05-28T19:25:07.123Z
  const datePart = iso.slice(0, 10);
  const timePart = iso.slice(11, 19);
  return `${datePart} ${timePart} UTC`;
}

// ---------------------------------------------------------------------------
// Fabrique publique
// ---------------------------------------------------------------------------

export function createHarnessTools(workspaceDir: string): McpSdkServerConfigWithInstance {
  const updateProgress = tool(
    "update_progress",
    "Append a timestamped progress entry to claude-progress.txt",
    {
      phase: z.string(),
      message: z.string(),
    },
    async ({ phase, message }) => {
      const path = join(workspaceDir, "claude-progress.txt");
      const ts = utcTimestamp();
      const line = `[${ts}] [${phase}] ${message}\n`;
      appendFileSync(path, line, { encoding: "utf-8" });
      return {
        content: [{ type: "text", text: `Progress updated: ${line.trim()}` }],
      };
    },
  );

  const validateJsonTool = tool(
    "validate_json",
    "Validate a JSON file against a known schema. " +
      "Available schemas: product_spec, feature_list, sprint_contract, qa_report, contract_review.",
    {
      file_path: z.string(),
      schema_name: z.enum(
        [...Object.keys(REQUIRED_KEYS), "feature_list"] as unknown as [string, ...string[]],
      ),
    },
    async ({ file_path, schema_name }) => validateJson(workspaceDir, file_path, schema_name),
  );

  return createSdkMcpServer({
    name: "harness",
    version: "1.0.0",
    tools: [updateProgress, validateJsonTool],
  });
}
