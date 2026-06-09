import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveWorkspace, validateProjectName } from "../src/paths";

describe("validateProjectName", () => {
  it.each(["myproj", "default", "blog-cuisine", "gestion-copro", "app_v2", "site.prod"])(
    "accepts the single-segment name %j",
    (name) => {
      expect(() => validateProjectName(name)).not.toThrow();
    },
  );

  it.each([
    ["../../../tmp/evil", "remontée de répertoires"],
    ["/etc/foo", "chemin absolu"],
    ["..", "référence parent"],
    [".", "référence courante"],
    ["a/b", "séparateur slash"],
    ["a\\b", "séparateur backslash"],
    ["", "nom vide"],
    ["mon projet", "espace"],
  ])("rejects %j (%s)", (name) => {
    expect(() => validateProjectName(name)).toThrow(/invalid project name/i);
  });
});

describe("resolveWorkspace", () => {
  it("resolves a valid name strictly inside the workspace root", () => {
    const root = path.resolve("./workspace");
    const workspace = resolveWorkspace("./workspace", "myproj");
    expect(workspace).toBe(path.join(root, "myproj"));
    expect(workspace.startsWith(root + path.sep)).toBe(true);
  });

  it("throws before resolving an escaped path", () => {
    expect(() => resolveWorkspace("./workspace", "../../../tmp/evil")).toThrow(
      /invalid project name/i,
    );
    expect(() => resolveWorkspace("./workspace", "/etc/foo")).toThrow(
      /invalid project name/i,
    );
  });
});
