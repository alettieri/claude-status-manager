/**
 * Unit tests for cli/commands/task.js — Phase 4 additions:
 *   - sm task criteria <task-id>
 *   - sm task remove <id>
 *   - sm task complete — unmet-criteria error format
 *
 * Strategy: require the real api module and replace its method properties
 * with vi.fn() stubs. CJS modules hold references to the same object, so
 * mutating the api object's methods is visible to task.js without
 * needing to reload modules.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Require both modules — task.js will use the same api object reference
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { api } = require("../../../cli/lib/api.js") as { api: Record<string, ReturnType<typeof vi.fn>> };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const taskCommand = require("../../../cli/commands/task.js");

// ---------------------------------------------------------------------------
// Replace api methods with vi.fn stubs before each test
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

async function runCommand(args: string[]) {
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("process.exit");
  });

  const capture = captureStreams();

  try {
    await taskCommand.parseAsync(["node", "sm", ...args]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message !== "process.exit") throw err;
  } finally {
    exitSpy.mockRestore();
  }

  // Capture values before restore() removes spy data
  const result = {
    stdout: capture.stdout,
    stderr: capture.stderr,
    consoleErrors: capture.consoleErrors,
  };
  capture.restore();
  return result;
}

// ---------------------------------------------------------------------------
// sm task criteria <task-id>
// ---------------------------------------------------------------------------

describe("sm task criteria <task-id>", () => {
  it("prints header, [x]/[ ] markers, ID suffix, and summary line", async () => {
    // "task-12345678".slice(0,8) === "task-123" — use a task ID where the prefix is predictable
    const taskId = "task-12345678-abcd";
    const criteriaList = [
      { id: "crit-aabbccdd-1111", text: "Must pass CI", checked: true },
      { id: "crit-eeffgghh-2222", text: "Must have tests", checked: false },
    ];

    api.get = vi.fn()
      .mockResolvedValueOnce(criteriaList) // GET /api/tasks/:id/criteria
      .mockResolvedValueOnce({ id: taskId, subject: "Build the widget" }); // GET /api/tasks/:id

    const capture = await runCommand(["criteria", taskId]);

    // Header includes short task ID prefix (first 8 chars) and subject
    expect(capture.stdout).toMatch(/Acceptance criteria for task task-123/);
    expect(capture.stdout).toMatch(/Build the widget/);

    // [x] for checked, [ ] for unchecked
    expect(capture.stdout).toMatch(/\[x\].*Must pass CI/);
    expect(capture.stdout).toMatch(/\[ \].*Must have tests/);

    // ID suffixes (first 8 chars of each criterion ID)
    expect(capture.stdout).toMatch(/crit-aab/);
    expect(capture.stdout).toMatch(/crit-eef/);

    // Summary line
    expect(capture.stdout).toMatch(/1 of 2 checked/);
  });

  it("prints 'No acceptance criteria' when the task has no criteria", async () => {
    const taskId = "task-empty-criteria";

    api.get = vi.fn().mockResolvedValueOnce([]); // GET /api/tasks/:id/criteria

    const capture = await runCommand(["criteria", taskId]);

    expect(capture.stdout).toBe("No acceptance criteria for this task.\n");
    // Should not attempt to fetch the task subject when list is empty
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("falls back to task ID prefix in header when task fetch fails", async () => {
    // "task-aabbccdd-fallback".slice(0,8) === "task-aab"
    const taskId = "task-aabbccdd-fallback";
    const criteriaList = [{ id: "crit-12345678", text: "Must deploy cleanly", checked: false }];

    api.get = vi.fn()
      .mockResolvedValueOnce(criteriaList) // GET criteria
      .mockRejectedValueOnce(new Error("Not found")); // GET task — fails non-fatally

    const capture = await runCommand(["criteria", taskId]);

    // Header uses ID prefix as fallback subject ("task-aab" = first 8 chars)
    expect(capture.stdout).toMatch(/Acceptance criteria for task task-aab/);
    // Still renders criteria
    expect(capture.stdout).toMatch(/Must deploy cleanly/);
    expect(capture.stdout).toMatch(/0 of 1 checked/);
  });

  it("shows correct checked count when all criteria are checked", async () => {
    const taskId = "task-all-checked";
    const criteriaList = [
      { id: "crit-11111111", text: "Criterion one", checked: true },
      { id: "crit-22222222", text: "Criterion two", checked: true },
      { id: "crit-33333333", text: "Criterion three", checked: true },
    ];

    api.get = vi.fn()
      .mockResolvedValueOnce(criteriaList)
      .mockResolvedValueOnce({ id: taskId, subject: "All done task" });

    const capture = await runCommand(["criteria", taskId]);

    expect(capture.stdout).toMatch(/3 of 3 checked/);
    // All rows use [x]
    const matches = capture.stdout.match(/\[x\]/g) ?? [];
    expect(matches).toHaveLength(3);
  });

  it("shows correct checked count when no criteria are checked", async () => {
    const taskId = "task-none-checked";
    const criteriaList = [
      { id: "crit-aaaaaaaa", text: "Not yet done", checked: false },
      { id: "crit-bbbbbbbb", text: "Also pending", checked: false },
    ];

    api.get = vi.fn()
      .mockResolvedValueOnce(criteriaList)
      .mockResolvedValueOnce({ id: taskId, subject: "Pending task" });

    const capture = await runCommand(["criteria", taskId]);

    expect(capture.stdout).toMatch(/0 of 2 checked/);
    const uncheckedMatches = capture.stdout.match(/\[ \]/g) ?? [];
    expect(uncheckedMatches).toHaveLength(2);
  });

  it("prints JSON output when --json flag is passed", async () => {
    const taskId = "task-json-criteria";
    const criteriaList = [{ id: "crit-jsontest", text: "JSON criterion", checked: false }];

    api.get = vi.fn().mockResolvedValueOnce(criteriaList);

    const capture = await runCommand(["criteria", taskId, "--json"]);

    const parsed = JSON.parse(capture.stdout);
    expect(parsed).toEqual(criteriaList);
  });

  it("prints error message when the criteria API throws", async () => {
    api.get = vi.fn().mockRejectedValueOnce(new Error("Task not found"));

    const capture = await runCommand(["criteria", "ghost-task"]);

    expect(capture.consoleErrors).toMatch(/Error: Task not found/);
  });
});

// ---------------------------------------------------------------------------
// sm task complete — unmet-criteria error format
// ---------------------------------------------------------------------------

describe("sm task complete — unmet acceptance criteria error", () => {
  it("lists unmet criteria with [ ] markers, ID suffixes, and hint line", async () => {
    const taskId = "task-unmet-12345678";

    const apiError = Object.assign(new Error("Acceptance criteria not met"), {
      status: 400,
      body: {
        error: "2 acceptance criteria unmet",
        unmet: [
          { id: "crit-unmet-1111", text: "Must have tests" },
          { id: "crit-unmet-2222", text: "Must pass code review" },
        ],
      },
    });

    api.post = vi.fn().mockRejectedValueOnce(apiError);

    const capture = await runCommand(["complete", taskId]);

    // Summary line on stderr
    expect(capture.stderr).toMatch(/Cannot complete: 2 acceptance criteria unmet/);

    // Each criterion listed with [ ] and ID suffix (first 8 chars)
    expect(capture.stderr).toMatch(/\[ \].*Must have tests.*crit-unm/);
    expect(capture.stderr).toMatch(/\[ \].*Must pass code review.*crit-unm/);

    // Hint line
    expect(capture.stderr).toMatch(/Use `sm criteria check <id>` to mark each one done\./);
  });

  it("shows singular message for exactly one unmet criterion", async () => {
    const taskId = "task-one-unmet";

    const apiError = Object.assign(new Error("Acceptance criteria not met"), {
      status: 400,
      body: {
        error: "1 acceptance criteria unmet",
        unmet: [{ id: "crit-solo-1234", text: "Must deploy to staging" }],
      },
    });

    api.post = vi.fn().mockRejectedValueOnce(apiError);

    const capture = await runCommand(["complete", taskId]);

    expect(capture.stderr).toMatch(/Cannot complete: 1 acceptance criteria unmet/);
    expect(capture.stderr).toMatch(/Must deploy to staging/);
    expect(capture.stderr).toMatch(/crit-sol/);
  });

  it("prints generic error when the 400 body has no unmet array", async () => {
    const taskId = "task-generic-400";

    const apiError = Object.assign(new Error("Bad request"), {
      status: 400,
      body: { error: "Bad request" },
    });

    api.post = vi.fn().mockRejectedValueOnce(apiError);

    const capture = await runCommand(["complete", taskId]);

    // Falls through to generic handler — no "Cannot complete" prefix
    expect(capture.consoleErrors).toMatch(/Error: Bad request/);
    expect(capture.stderr).not.toMatch(/Cannot complete/);
  });

  it("prints generic error for non-400 API failures", async () => {
    const taskId = "task-server-error";

    const apiError = Object.assign(new Error("Internal server error"), {
      status: 500,
      body: { error: "Internal server error" },
    });

    api.post = vi.fn().mockRejectedValueOnce(apiError);

    const capture = await runCommand(["complete", taskId]);

    expect(capture.consoleErrors).toMatch(/Error: Internal server error/);
    expect(capture.stderr).not.toMatch(/Cannot complete/);
  });

  it("prints success message when task completes cleanly", async () => {
    // "task-completes-ok-1234".slice(0,8) === "task-com"
    const taskId = "task-completes-ok-1234";

    api.post = vi.fn().mockResolvedValueOnce({
      id: taskId,
      status: "COMPLETED",
      result: "All checks passed",
    });

    const capture = await runCommand(["complete", taskId]);

    expect(capture.stdout).toMatch(/Task task-com marked COMPLETED/);
    expect(capture.stdout).toMatch(/Result: All checks passed/);
  });
});

// ---------------------------------------------------------------------------
// sm task remove <id>
// ---------------------------------------------------------------------------

describe("sm task remove <id>", () => {
  it("prints 'Removed task <id-prefix>' after a successful delete", async () => {
    const taskId = "task-remove-aabbccdd-1234";

    api.delete = vi.fn().mockResolvedValueOnce(null);

    const capture = await runCommand(["remove", taskId]);

    expect(api.delete).toHaveBeenCalledWith(`/api/tasks/${taskId}`);
    expect(capture.stdout).toBe("Removed task task-rem\n");
  });

  it("uses the first 8 characters of the task ID in the output", async () => {
    const taskId = "abcdefghijklmnop";

    api.delete = vi.fn().mockResolvedValueOnce(null);

    const capture = await runCommand(["remove", taskId]);

    expect(capture.stdout).toBe("Removed task abcdefgh\n");
  });

  it("prints JSON output when --json flag is passed", async () => {
    const taskId = "task-remove-json";

    api.delete = vi.fn().mockResolvedValueOnce(null);

    const capture = await runCommand(["remove", taskId, "--json"]);

    const parsed = JSON.parse(capture.stdout);
    expect(parsed).toEqual({ removed: true });
  });

  it("prints error message when the API throws", async () => {
    const taskId = "task-remove-ghost";

    api.delete = vi.fn().mockRejectedValueOnce(new Error("Task not found"));

    const capture = await runCommand(["remove", taskId]);

    expect(capture.consoleErrors).toMatch(/Error: Task not found/);
  });
});
