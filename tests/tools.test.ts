import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { validateJson } from "../src/tools";

describe("validateJson", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "harness-tools-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("accepts a valid qa_report object", () => {
    const valid = {
      sprint_id: 1,
      overall_score: 8.5,
      verdict: "PASS",
      scores: { quality: 9 },
      bugs: [],
    };
    writeFileSync(join(workspace, "qa_report.json"), JSON.stringify(valid), "utf-8");

    const res = validateJson(workspace, "qa_report.json", "qa_report");
    expect(res.isError).toBeFalsy();
    expect(res.content[0]?.text).toBe("Valid qa_report.");
  });

  it("rejects an object with missing required keys", () => {
    const incomplete = { sprint_id: 1, verdict: "PASS" };
    writeFileSync(join(workspace, "qa_report.json"), JSON.stringify(incomplete), "utf-8");

    const res = validateJson(workspace, "qa_report.json", "qa_report");
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain("Missing required keys");
  });

  it("accepts a valid feature_list array", () => {
    const features = [
      { id: "f1", sprint: 1, category: "ui", description: "Login form", passes: false },
      { id: "f2", sprint: 1, category: "api", description: "Auth endpoint", passes: true },
    ];
    writeFileSync(join(workspace, "feature_list.json"), JSON.stringify(features), "utf-8");

    const res = validateJson(workspace, "feature_list.json", "feature_list");
    expect(res.isError).toBeFalsy();
    expect(res.content[0]?.text).toBe("Valid feature_list with 2 items.");
  });

  it("rejects feature_list items with missing keys", () => {
    const features = [{ id: "f1", sprint: 1 }];
    writeFileSync(join(workspace, "feature_list.json"), JSON.stringify(features), "utf-8");

    const res = validateJson(workspace, "feature_list.json", "feature_list");
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain("Validation errors:");
  });

  it("rejects an unknown schema", () => {
    writeFileSync(join(workspace, "thing.json"), JSON.stringify({ a: 1 }), "utf-8");

    const res = validateJson(workspace, "thing.json", "totally_unknown");
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain("Unknown schema: totally_unknown");
  });

  it("reports a missing file", () => {
    const res = validateJson(workspace, "nope.json", "qa_report");
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain("File not found:");
  });

  it("reports invalid JSON", () => {
    writeFileSync(join(workspace, "broken.json"), "{ not valid json", "utf-8");

    const res = validateJson(workspace, "broken.json", "qa_report");
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain("Invalid JSON:");
  });
});
