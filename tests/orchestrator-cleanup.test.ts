/**
 * DX-14 — diagnostic du nettoyage des ports (orchestrator.cleanupWorkspacePorts).
 *
 * lsof (spawnSync) et procfs (fs) sont mockés : on vérifie que chaque
 * condition d'environnement auparavant muette émet désormais un console.debug,
 * sans jamais faire échouer le nettoyage ni changer son comportement nominal.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const mocked = { ...actual, spawnSync: vi.fn(actual.spawnSync) };
  return { ...mocked, default: mocked };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const mocked = {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
    readlinkSync: vi.fn(actual.readlinkSync),
  };
  return { ...mocked, default: mocked };
});

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { cleanupWorkspacePorts } from "../src/orchestrator";

const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");
const actualCp =
  await vi.importActual<typeof import("node:child_process")>(
    "node:child_process",
  );

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockedSpawnSync = vi.mocked(spawnSync);
const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedReadlinkSync = vi.mocked(fs.readlinkSync);

/** Résultat spawnSync minimal simulant la sortie de lsof. */
function lsofOut(stdout: string): ReturnType<typeof spawnSync> {
  return { stdout } as unknown as ReturnType<typeof spawnSync>;
}

/** /proc présent (true) ou absent (false), délègue au vrai fs sinon. */
function procExists(exists: boolean): void {
  mockedExistsSync.mockImplementation((p) =>
    String(p) === "/proc" ? exists : actualFs.existsSync(p),
  );
}

describe("cleanupWorkspacePorts (DX-14 : diagnostic des catch muets)", () => {
  let tmp: string;
  let debug: ReturnType<typeof vi.spyOn>;
  let info: ReturnType<typeof vi.spyOn>;
  let kill: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockedSpawnSync.mockReset();
    mockedSpawnSync.mockImplementation(
      actualCp.spawnSync as unknown as typeof spawnSync,
    );
    mockedExistsSync.mockReset();
    mockedExistsSync.mockImplementation(actualFs.existsSync);
    mockedReadlinkSync.mockReset();
    mockedReadlinkSync.mockImplementation(
      actualFs.readlinkSync as unknown as typeof fs.readlinkSync,
    );

    debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    info = vi.spyOn(console, "info").mockImplementation(() => {});
    kill = vi
      .spyOn(process, "kill")
      .mockImplementation(() => true) as unknown as ReturnType<typeof vi.spyOn>;

    tmp = actualFs.mkdtempSync(path.join(os.tmpdir(), "dx14-cleanup-"));
  });

  afterEach(() => {
    actualFs.rmSync(tmp, { recursive: true, force: true });
    debug.mockRestore();
    info.mockRestore();
    kill.mockRestore();
  });

  function debugMessages(): string {
    return debug.mock.calls.map((c) => String(c[0])).join("\n");
  }

  it("lsof indisponible (out.error) : un console.debug explicatif, aucun kill, pas d'exception", () => {
    mockedSpawnSync.mockReturnValue({
      error: new Error("spawnSync lsof ENOENT"),
      stdout: "",
    } as unknown as ReturnType<typeof spawnSync>);

    expect(() => cleanupWorkspacePorts(tmp)).not.toThrow();

    expect(debug).toHaveBeenCalledTimes(1);
    expect(debugMessages()).toMatch(/lsof/);
    expect(kill).not.toHaveBeenCalled();
  });

  it("spawnSync qui lève : un console.debug explicatif, pas d'exception", () => {
    mockedSpawnSync.mockImplementation(() => {
      throw new Error("EPERM");
    });

    expect(() => cleanupWorkspacePorts(tmp)).not.toThrow();

    expect(debug).toHaveBeenCalledTimes(1);
    expect(debugMessages()).toMatch(/lsof/);
    expect(kill).not.toHaveBeenCalled();
  });

  it("/proc absent (macOS) : UN SEUL console.debug (pas N lignes par PID) puis skip", () => {
    mockedSpawnSync.mockReturnValue(lsofOut("1234\n5678\n9012\n"));
    procExists(false);

    cleanupWorkspacePorts(tmp);

    expect(debug).toHaveBeenCalledTimes(1);
    expect(debugMessages()).toMatch(/\/proc/);
    expect(mockedReadlinkSync).not.toHaveBeenCalled();
    expect(kill).not.toHaveBeenCalled();
  });

  it("fidélité : un échec readlink sur UN pid reste silencieux (continue, pas de spam)", () => {
    mockedSpawnSync.mockReturnValue(lsofOut("424242\n"));
    procExists(true);
    mockedReadlinkSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    expect(() => cleanupWorkspacePorts(tmp)).not.toThrow();

    expect(debug).not.toHaveBeenCalled();
    expect(kill).not.toHaveBeenCalled();
  });

  it("fidélité : tue les PID dont le cwd est dans le workspace et loggue via console.info", () => {
    mockedSpawnSync.mockReturnValue(lsofOut("4242\n"));
    procExists(true);
    mockedReadlinkSync.mockImplementation(() => tmp);

    cleanupWorkspacePorts(tmp);

    expect(kill).toHaveBeenCalledWith(4242, "SIGTERM");
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(info.mock.calls[0][0])).toContain("4242");
    expect(debug).not.toHaveBeenCalled();
  });

  it("process.kill qui échoue (ProcessLookupError) : tracé en debug, jamais propagé", () => {
    mockedSpawnSync.mockReturnValue(lsofOut("777\n"));
    procExists(true);
    mockedReadlinkSync.mockImplementation(() => tmp);
    kill.mockImplementation(() => {
      throw new Error("ESRCH");
    });

    expect(() => cleanupWorkspacePorts(tmp)).not.toThrow();

    expect(info).not.toHaveBeenCalled(); // rien n'a été tué -> pas de log succès
    expect(debug).toHaveBeenCalled();
    expect(debugMessages()).toContain("777");
  });

  it("catch global : une erreur inattendue est logguée en debug et jamais propagée", () => {
    mockedSpawnSync.mockReturnValue(lsofOut("1234\n"));
    mockedExistsSync.mockImplementation((p) => {
      if (String(p) === "/proc") {
        throw new Error("weird fs failure");
      }
      return actualFs.existsSync(p);
    });

    expect(() => cleanupWorkspacePorts(tmp)).not.toThrow();

    expect(debug).toHaveBeenCalledTimes(1);
    expect(debugMessages()).toMatch(/inattendue/);
    expect(kill).not.toHaveBeenCalled();
  });
});
