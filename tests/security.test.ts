import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { createPermissionHandler } from "../src/security";
import type { Config } from "../src/types";

const config = {
  security: {
    bash_allowlist: ["npm", "cd", "curl", "git", "ls", "node"],
    bash_denylist: ["rm -rf /", "sudo"],
  },
} as unknown as Config;

const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-security-"));
const handler = createPermissionHandler(config, workspaceDir);

const ctx = { signal: new AbortController().signal, toolUseID: "test" };

afterAll(() => {
  fs.rmSync(workspaceDir, { recursive: true, force: true });
});

describe("createPermissionHandler", () => {
  it("allows an allowlisted bash command", async () => {
    const result = await handler("Bash", { command: "npm install" }, ctx);
    expect(result.behavior).toBe("allow");
  });

  it("denies a command matching a deny pattern", async () => {
    const result = await handler("Bash", { command: "rm -rf / now" }, ctx);
    expect(result.behavior).toBe("deny");
  });

  it("denies a sudo command", async () => {
    const result = await handler("Bash", { command: "sudo rm" }, ctx);
    expect(result.behavior).toBe("deny");
  });

  it("denies a cd that would leave the workspace", async () => {
    const result = await handler("Bash", { command: "cd ../autre && npm i" }, ctx);
    expect(result.behavior).toBe("deny");
  });

  it("denies a bare cd", async () => {
    const result = await handler("Bash", { command: "cd" }, ctx);
    expect(result.behavior).toBe("deny");
  });

  it("denies a Read outside the workspace", async () => {
    const result = await handler("Read", { file_path: "/etc/passwd" }, ctx);
    expect(result.behavior).toBe("deny");
  });

  it("allows a Write inside the workspace", async () => {
    const target = path.join(workspaceDir, "file.txt");
    const result = await handler("Write", { file_path: target }, ctx);
    expect(result.behavior).toBe("allow");
  });

  it("allows a Glob with no path", async () => {
    const result = await handler("Glob", {}, ctx);
    expect(result.behavior).toBe("allow");
  });
});
