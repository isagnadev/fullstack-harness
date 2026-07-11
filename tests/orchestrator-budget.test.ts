import { describe, it, expect } from "vitest";

import { formatUncountedRunsWarning } from "../src/orchestrator";

describe("formatUncountedRunsWarning (DX-20)", () => {
  it("retourne null quand aucun run non comptabilisé", () => {
    expect(formatUncountedRunsWarning(0, 12.34, 700)).toBeNull();
  });

  it("mentionne le nombre de runs, le total courant et le plafond", () => {
    const msg = formatUncountedRunsWarning(3, 12.345, 700);
    expect(msg).not.toBeNull();
    expect(msg).toContain("3 failed run(s)");
    expect(msg).toContain("$12.35"); // toFixed(2)
    expect(msg).toContain("$700.00");
  });

  it("explicite la posture « borne basse » du garde-fou budgétaire", () => {
    const msg = formatUncountedRunsWarning(1, 0, 700);
    expect(msg).toContain("lower bound");
    expect(msg).toContain("total_cost_usd");
  });
});
