import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  makeAgentRun,
  ProjectProgress,
  appendProgressLog,
  type AgentRun,
} from "../src/progress";

function run(phase: string, cost: number, agent = "builder"): AgentRun {
  return makeAgentRun({
    agent,
    phase,
    cost_usd: cost,
    duration_ms: 100,
    num_turns: 3,
    success: true,
  });
}

describe("makeAgentRun", () => {
  it("ajoute un timestamp ISO 8601", () => {
    const r = run("planning", 0.5);
    expect(typeof r.timestamp).toBe("string");
    // ISO 8601 valide -> reparsable et non-NaN
    expect(Number.isNaN(Date.parse(r.timestamp))).toBe(false);
  });
});

describe("ProjectProgress.addRun", () => {
  it("met à jour total_cost_usd et empile les runs", () => {
    const p = new ProjectProgress("demo");
    expect(p.total_cost_usd).toBe(0);
    expect(p.runs).toHaveLength(0);

    p.addRun(run("planning", 0.25));
    p.addRun(run("sprint_1_build_0", 0.75));

    expect(p.runs).toHaveLength(2);
    expect(p.total_cost_usd).toBeCloseTo(1.0, 10);
  });
});

describe("ProjectProgress.uncounted_runs (DX-20)", () => {
  it("vaut 0 sur une instance vierge", () => {
    const p = new ProjectProgress("demo");
    expect(p.uncounted_runs).toBe(0);
  });

  it("addRun({success:false, cost_usd:0}) incrémente uncounted_runs et laisse total_cost_usd inchangé", () => {
    const p = new ProjectProgress("demo");
    p.addRun(run("planning", 0.5));
    expect(p.total_cost_usd).toBeCloseTo(0.5, 10);

    const failed = makeAgentRun({
      agent: "builder",
      phase: "sprint_1_build_0",
      cost_usd: 0,
      duration_ms: 42,
      num_turns: 0,
      success: false,
    });
    p.addRun(failed);

    expect(p.uncounted_runs).toBe(1);
    expect(p.total_cost_usd).toBeCloseTo(0.5, 10); // inchangé (cost_usd=0 additionné tel quel)
    expect(p.runs).toHaveLength(2); // le run échoué reste compté dans runs[]
  });

  it("addRun({success:false, cost_usd>0}) n'incrémente PAS uncounted_runs (coût réel comptabilisé, ex. error_max_turns)", () => {
    const p = new ProjectProgress("demo");
    const failedWithCost = makeAgentRun({
      agent: "builder",
      phase: "sprint_1_build_0",
      cost_usd: 20,
      duration_ms: 42,
      num_turns: 210,
      success: false,
    });
    p.addRun(failedWithCost);

    expect(p.uncounted_runs).toBe(0); // le coût A été comptabilisé
    expect(p.total_cost_usd).toBeCloseTo(20, 10);
    expect(p.runs).toHaveLength(1);
  });

  it("addRun avec success:true n'incrémente pas uncounted_runs", () => {
    const p = new ProjectProgress("demo");
    p.addRun(run("planning", 0.25));
    p.addRun(run("sprint_1_build_0", 0.75));
    expect(p.uncounted_runs).toBe(0);
  });

  it("round-trip save/load préserve uncounted_runs", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-progress-"));
    try {
      const p = new ProjectProgress("demo");
      p.addRun(
        makeAgentRun({
          agent: "planner",
          phase: "planning",
          cost_usd: 0,
          duration_ms: 10,
          num_turns: 0,
          success: false,
        }),
      );
      p.addRun(
        makeAgentRun({
          agent: "evaluator",
          phase: "sprint_1_qa_0",
          cost_usd: 0,
          duration_ms: 10,
          num_turns: 0,
          success: false,
        }),
      );
      expect(p.uncounted_runs).toBe(2);

      p.save(dir);
      const loaded = ProjectProgress.load(dir);
      expect(loaded.uncounted_runs).toBe(2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("load d'un progress.json legacy sans uncounted_runs retourne 0 (rétrocompat)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-progress-"));
    try {
      // Fichier V1 : aucun champ uncounted_runs.
      const legacy = {
        project_name: "legacy",
        runs: [],
        current_sprint: 1,
        failed_sprints: [],
        total_cost_usd: 3.5,
      };
      fs.writeFileSync(
        path.join(dir, "progress.json"),
        JSON.stringify(legacy, null, 2),
        "utf-8",
      );

      const loaded = ProjectProgress.load(dir);
      expect(loaded.uncounted_runs).toBe(0);
      expect(loaded.total_cost_usd).toBeCloseTo(3.5, 10);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("ProjectProgress.isOverBudget", () => {
  it("renvoie true quand total_cost_usd >= maxUsd (limite incluse)", () => {
    const p = new ProjectProgress("demo");
    p.addRun(run("planning", 2.0));

    expect(p.isOverBudget(3.0)).toBe(false);
    expect(p.isOverBudget(2.0)).toBe(true); // égalité -> over budget
    expect(p.isOverBudget(1.5)).toBe(true);
  });
});

describe("ProjectProgress.sprintCost", () => {
  it("filtre par sous-chaîne sprint_<num> dans phase", () => {
    const p = new ProjectProgress("demo");
    p.addRun(run("planning", 1.0));
    p.addRun(run("sprint_1_contract", 0.5));
    p.addRun(run("sprint_1_build_0", 0.5));
    p.addRun(run("sprint_2_build_0", 3.0));

    expect(p.sprintCost(1)).toBeCloseTo(1.0, 10);
    expect(p.sprintCost(2)).toBeCloseTo(3.0, 10);
    expect(p.sprintCost(3)).toBe(0);
  });
});

describe("ProjectProgress round-trip save/load", () => {
  it("préserve tous les champs après save puis load", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-progress-"));
    try {
      const p = new ProjectProgress("my-project");
      p.current_sprint = 2;
      p.failed_sprints = [1];
      p.addRun(run("planning", 0.5, "planner"));
      p.addRun(run("sprint_1_build_0", 1.25, "builder"));
      p.save(dir);

      // Le fichier progress.json existe bien
      expect(fs.existsSync(path.join(dir, "progress.json"))).toBe(true);

      const loaded = ProjectProgress.load(dir);
      expect(loaded.project_name).toBe(p.project_name);
      expect(loaded.current_sprint).toBe(p.current_sprint);
      expect(loaded.failed_sprints).toEqual(p.failed_sprints);
      expect(loaded.total_cost_usd).toBeCloseTo(p.total_cost_usd, 10);
      expect(loaded.runs).toEqual(p.runs);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("retourne une instance vierge 'unknown' si le fichier n'existe pas", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-progress-"));
    try {
      const loaded = ProjectProgress.load(dir);
      expect(loaded.project_name).toBe("unknown");
      expect(loaded.runs).toEqual([]);
      expect(loaded.current_sprint).toBe(0);
      expect(loaded.failed_sprints).toEqual([]);
      expect(loaded.total_cost_usd).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("appendProgressLog", () => {
  it("ajoute une ligne horodatée au format '[YYYY-MM-DD HH:MM:SS UTC] message'", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-progress-"));
    try {
      appendProgressLog(dir, "premier message");
      appendProgressLog(dir, "second message");

      const content = fs.readFileSync(
        path.join(dir, "claude-progress.txt"),
        "utf-8",
      );
      const lines = content.split("\n").filter((l) => l.length > 0);
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatch(
        /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\] premier message$/,
      );
      expect(lines[1]).toMatch(
        /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\] second message$/,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
