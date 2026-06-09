/**
 * Validation du nom de projet et résolution sécurisée du workspace.
 *
 * Divergence assumée vs V1 (DX-16) : la V1 Python passe `sys.argv[2]` tel quel
 * à `os.path.join` — un nom contenant `..` ou un chemin absolu résout HORS de
 * `./workspace` et déplace la racine du confinement sécurité des agents
 * (security.ts:absWorkspace). Le harnais TS rejette ces noms au lancement,
 * avant tout effet de bord (mkdir, git init, écriture de progress).
 */

import path from "node:path";

import { isInside } from "./security";

const PROJECT_NAME_RE = /^[A-Za-z0-9._-]+$/;

/**
 * Rejette tout nom de projet qui n'est pas un segment de chemin unique et sûr.
 *
 * Autorisé : lettres, chiffres, `.`, `_`, `-` (ex. `blog-cuisine`, `app_v2`).
 * Refusé : nom vide, `.`, `..`, séparateurs `/` ou `\`, chemins absolus.
 */
export function validateProjectName(name: string): void {
  if (!PROJECT_NAME_RE.test(name) || name === "." || name === "..") {
    throw new Error(
      `Invalid project name ${JSON.stringify(name)}: must be a single path segment ` +
        `matching [A-Za-z0-9._-]+ (no '/', '\\', '..' or absolute paths)`,
    );
  }
}

/**
 * Résout `<workspaceRoot>/<projectName>` en garantissant que le résultat reste
 * strictement à l'intérieur de la racine workspace.
 *
 * La garde `isInside` est une défense en profondeur : inatteignable tant que
 * `validateProjectName` n'accepte que des segments uniques, mais elle protège
 * la frontière de confinement si la validation évolue.
 */
export function resolveWorkspace(workspaceRoot: string, projectName: string): string {
  validateProjectName(projectName);
  const root = path.resolve(workspaceRoot);
  const workspace = path.resolve(root, projectName);
  if (!isInside(workspace, root)) {
    throw new Error(
      `Invalid project name ${JSON.stringify(projectName)}: resolves outside workspace root ${root}`,
    );
  }
  return workspace;
}
