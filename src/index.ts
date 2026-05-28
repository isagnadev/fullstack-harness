#!/usr/bin/env node
/**
 * Point d'entrée CLI de l'orchestrateur.
 *
 * Usage : tsx src/index.ts "<prompt>" [project-name]
 */

import { main } from "./orchestrator";

const userPrompt = process.argv[2];
if (userPrompt === undefined) {
  console.log("Usage: tsx src/index.ts <user-prompt> [project-name]");
  process.exit(1);
}

const projectName = process.argv[3] ?? "default";

main(userPrompt, projectName).catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
