import { describe, it, expect } from "vitest";

import { sprintPassed } from "../src/orchestrator";

describe("sprintPassed", () => {
  it("PASS quand verdict='PASS' et score >= 8", () => {
    expect(sprintPassed({ verdict: "PASS", overall_score: 8 }, 8)).toBe(true);
    expect(sprintPassed({ verdict: "PASS", overall_score: 9.5 }, 8)).toBe(true);
  });

  it("FAIL quand verdict='FAIL' (même score élevé)", () => {
    expect(sprintPassed({ verdict: "FAIL", overall_score: 10 }, 8)).toBe(false);
  });

  it("FAIL quand score < 8 même si verdict='PASS'", () => {
    expect(sprintPassed({ verdict: "PASS", overall_score: 7.9 }, 8)).toBe(false);
  });

  it("FAIL quand le rapport est null/undefined", () => {
    expect(sprintPassed(null, 8)).toBe(false);
    expect(sprintPassed(undefined, 8)).toBe(false);
  });

  it("FAIL quand overall_score est absent (défaut 0)", () => {
    expect(sprintPassed({ verdict: "PASS" }, 8)).toBe(false);
  });
});
