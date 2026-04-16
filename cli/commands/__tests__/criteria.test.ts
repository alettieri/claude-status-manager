/**
 * Unit tests for cli/commands/criteria.js — sm criteria check / uncheck
 *
 * Strategy: require the real api module and replace its method properties
 * with vi.fn() stubs. CJS modules hold references to the same object, so
 * mutating the api object's methods is visible to criteria.js without
 * needing to reload modules.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Require both modules — criteria will capture the same api object reference
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { api } = require("../../../cli/lib/api.js") as { api: Record<string, ReturnType<typeof vi.fn>> };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const criteriaCommand = require("../../../cli/commands/criteria.js");

// ---------------------------------------------------------------------------
// Replace api methods with vi.fn stubs
// ---------------------------------------------------------------------------

beforeEach(() => {
  api.get = vi.fn();
  api.post = vi.fn();
  api.patch = vi.fn();
  api.delete = vi.fn();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function captureStreams() {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const stdoutSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

  const stderrSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });

  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  return {
    get stdout() {
      return stdout.join("");
    },
    get stderr() {
      return stderr.join("");
    },
    get consoleErrors() {
      return consoleErrorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    },
    restore() {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runCommand(args: string[]) {
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("process.exit");
  });

  const capture = captureStreams();

  try {
    await criteriaCommand.parseAsync(["node", "sm", ...args]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message !== "process.exit") throw err;
  } finally {
    exitSpy.mockRestore();
  }

  // Restore stream spies AFTER reading — restore() removes spy data
  const result = {
    stdout: capture.stdout,
    stderr: capture.stderr,
    consoleErrors: capture.consoleErrors,
  };
  capture.restore();
  return result;
}

// ---------------------------------------------------------------------------
// sm criteria check <id>
// ---------------------------------------------------------------------------

describe("sm criteria check <id>", () => {
  it("prints 'Checked: <text>' when the API call succeeds", async () => {
    api.post = vi.fn().mockResolvedValue({ id: "crit-abc-123", text: "Must pass CI", checked: true });

    const capture = await runCommand(["check", "crit-abc-123"]);

    expect(api.post).toHaveBeenCalledWith("/api/criteria/crit-abc-123/check", {});
    expect(capture.stdout).toBe("Checked: Must pass CI\n");
  });

  it("uses the full criterion text in the output", async () => {
    api.post = vi.fn().mockResolvedValue({
      id: "crit-xyz",
      text: "All integration tests must pass without flakiness",
      checked: true,
    });

    const capture = await runCommand(["check", "crit-xyz"]);

    expect(capture.stdout).toBe(
      "Checked: All integration tests must pass without flakiness\n"
    );
  });

  it("prints JSON output when --json flag is passed", async () => {
    const criterion = { id: "crit-json", text: "Must be reviewed", checked: true };
    api.post = vi.fn().mockResolvedValue(criterion);

    const capture = await runCommand(["check", "crit-json", "--json"]);

    const parsed = JSON.parse(capture.stdout);
    expect(parsed).toEqual(criterion);
  });

  it("exits with an error message when the API throws", async () => {
    api.post = vi.fn().mockRejectedValue(new Error("Criterion not found"));

    const capture = await runCommand(["check", "ghost-id"]);

    expect(capture.consoleErrors).toMatch(/Error: Criterion not found/);
  });
});

// ---------------------------------------------------------------------------
// sm criteria uncheck <id>
// ---------------------------------------------------------------------------

describe("sm criteria uncheck <id>", () => {
  it("prints 'Unchecked: <text>' when the API call succeeds", async () => {
    api.post = vi.fn().mockResolvedValue({ id: "crit-def-456", text: "Must have tests", checked: false });

    const capture = await runCommand(["uncheck", "crit-def-456"]);

    expect(api.post).toHaveBeenCalledWith("/api/criteria/crit-def-456/uncheck", {});
    expect(capture.stdout).toBe("Unchecked: Must have tests\n");
  });

  it("uses the full criterion text in the output", async () => {
    api.post = vi.fn().mockResolvedValue({
      id: "crit-long",
      text: "Documentation must be updated to reflect changes",
      checked: false,
    });

    const capture = await runCommand(["uncheck", "crit-long"]);

    expect(capture.stdout).toBe(
      "Unchecked: Documentation must be updated to reflect changes\n"
    );
  });

  it("prints JSON output when --json flag is passed", async () => {
    const criterion = { id: "crit-json2", text: "No regressions", checked: false };
    api.post = vi.fn().mockResolvedValue(criterion);

    const capture = await runCommand(["uncheck", "crit-json2", "--json"]);

    const parsed = JSON.parse(capture.stdout);
    expect(parsed).toEqual(criterion);
  });

  it("exits with an error message when the API throws", async () => {
    api.post = vi.fn().mockRejectedValue(new Error("Criterion not found"));

    const capture = await runCommand(["uncheck", "ghost-id"]);

    expect(capture.consoleErrors).toMatch(/Error: Criterion not found/);
  });
});
