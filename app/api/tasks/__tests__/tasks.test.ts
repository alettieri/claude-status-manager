import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET as listTasks, POST as createTask } from "../../phases/[id]/tasks/route";
import { POST as claimNextTask } from "../../phases/[id]/tasks/next/route";
import { GET as getTask, PATCH as patchTask, DELETE as deleteTask } from "../[id]/route";
import { POST as completeTask } from "../[id]/complete/route";
import { POST as failTask } from "../[id]/fail/route";
import { GET as getActiveTasks } from "../active/route";
import { seedProject, seedWorktree, seedPlan, seedPhase, seedTask } from "./test-helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// POST /api/phases/[id]/tasks — create task
// ---------------------------------------------------------------------------

describe("POST /api/phases/[id]/tasks", () => {
  it("creates a task with subject and order and returns 201", async () => {
    const project = await seedProject("create-task-project");
    const worktree = await seedWorktree(project.id, "create-task-wt");
    const plan = await seedPlan(worktree.id, "Create Task Plan");
    const phase = await seedPhase(plan.id, "Phase One", 1);

    const res = await createTask(
      makeRequest("POST", `http://localhost/api/phases/${phase.id}/tasks`, {
        subject: "Implement feature",
        order: 1,
      }),
      makeParams(phase.id)
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.id).toBeTruthy();
    expect(body.phaseId).toBe(phase.id);
    expect(body.subject).toBe("Implement feature");
    expect(body.order).toBe(1);
    expect(body.status).toBe("PENDING");
  });

  it("returns 400 when subject is missing", async () => {
    const project = await seedProject("create-task-no-subject-project");
    const worktree = await seedWorktree(project.id, "create-task-no-subject-wt");
    const plan = await seedPlan(worktree.id, "No Subject Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);

    const res = await createTask(
      makeRequest("POST", `http://localhost/api/phases/${phase.id}/tasks`, { order: 1 }),
      makeParams(phase.id)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/subject/i);
  });

  it("returns 400 when order is not a positive integer", async () => {
    const project = await seedProject("create-task-bad-order-project");
    const worktree = await seedWorktree(project.id, "create-task-bad-order-wt");
    const plan = await seedPlan(worktree.id, "Bad Order Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);

    const resZero = await createTask(
      makeRequest("POST", `http://localhost/api/phases/${phase.id}/tasks`, {
        subject: "Task",
        order: 0,
      }),
      makeParams(phase.id)
    );
    expect(resZero.status).toBe(400);
    const bodyZero = await resZero.json();
    expect(bodyZero.error).toMatch(/order/i);

    const resFloat = await createTask(
      makeRequest("POST", `http://localhost/api/phases/${phase.id}/tasks`, {
        subject: "Task",
        order: 1.5,
      }),
      makeParams(phase.id)
    );
    expect(resFloat.status).toBe(400);
  });

  it("returns 404 when phase does not exist", async () => {
    const res = await createTask(
      makeRequest("POST", "http://localhost/api/phases/ghost-phase/tasks", {
        subject: "Ghost Task",
        order: 1,
      }),
      makeParams("ghost-phase")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// GET /api/phases/[id]/tasks — list tasks
// ---------------------------------------------------------------------------

describe("GET /api/phases/[id]/tasks", () => {
  it("returns tasks ordered by order field", async () => {
    const project = await seedProject("list-tasks-project");
    const worktree = await seedWorktree(project.id, "list-tasks-wt");
    const plan = await seedPlan(worktree.id, "List Tasks Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    await seedTask(phase.id, "Third task", 3);
    await seedTask(phase.id, "First task", 1);
    await seedTask(phase.id, "Second task", 2);

    const res = await listTasks(
      makeRequest("GET", `http://localhost/api/phases/${phase.id}/tasks`),
      makeParams(phase.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(3);
    expect(body[0].subject).toBe("First task");
    expect(body[1].subject).toBe("Second task");
    expect(body[2].subject).toBe("Third task");
  });

  it("returns 404 when phase does not exist", async () => {
    const res = await listTasks(
      makeRequest("GET", "http://localhost/api/phases/ghost-phase/tasks"),
      makeParams("ghost-phase")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// POST /api/phases/[id]/tasks/next — atomic claiming
// ---------------------------------------------------------------------------

describe("POST /api/phases/[id]/tasks/next", () => {
  it("claims the next pending task and returns it as IN_PROGRESS with agentId", async () => {
    const project = await seedProject("claim-task-project");
    const worktree = await seedWorktree(project.id, "claim-task-wt");
    const plan = await seedPlan(worktree.id, "Claim Task Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    await seedTask(phase.id, "Claimable task", 1);

    const res = await claimNextTask(
      makeRequest("POST", `http://localhost/api/phases/${phase.id}/tasks/next`, {
        agentId: "agent-007",
      }),
      makeParams(phase.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("IN_PROGRESS");
    expect(body.agentId).toBe("agent-007");
    expect(body.subject).toBe("Claimable task");
  });

  it("claims tasks in order — lowest order number first", async () => {
    const project = await seedProject("claim-order-project");
    const worktree = await seedWorktree(project.id, "claim-order-wt");
    const plan = await seedPlan(worktree.id, "Claim Order Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    await seedTask(phase.id, "Second task", 2);
    await seedTask(phase.id, "First task", 1);

    const res = await claimNextTask(
      makeRequest("POST", `http://localhost/api/phases/${phase.id}/tasks/next`, {
        agentId: "agent-001",
      }),
      makeParams(phase.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.subject).toBe("First task");
  });

  it("returns 404 when no pending tasks remain in the phase", async () => {
    const project = await seedProject("claim-no-pending-project");
    const worktree = await seedWorktree(project.id, "claim-no-pending-wt");
    const plan = await seedPlan(worktree.id, "No Pending Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    await seedTask(phase.id, "Done task", 1, { status: "COMPLETED" });

    const res = await claimNextTask(
      makeRequest("POST", `http://localhost/api/phases/${phase.id}/tasks/next`, {
        agentId: "agent-002",
      }),
      makeParams(phase.id)
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/no pending tasks/i);
  });

  it("returns 404 when phase does not exist", async () => {
    const res = await claimNextTask(
      makeRequest("POST", "http://localhost/api/phases/ghost-phase/tasks/next", {
        agentId: "agent-003",
      }),
      makeParams("ghost-phase")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 400 when agentId is missing", async () => {
    const project = await seedProject("claim-no-agent-project");
    const worktree = await seedWorktree(project.id, "claim-no-agent-wt");
    const plan = await seedPlan(worktree.id, "No Agent Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    await seedTask(phase.id, "Some task", 1);

    const res = await claimNextTask(
      makeRequest("POST", `http://localhost/api/phases/${phase.id}/tasks/next`, {}),
      makeParams(phase.id)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/agentId/i);
  });

  it("two sequential claims get different tasks", async () => {
    const project = await seedProject("two-claims-project");
    const worktree = await seedWorktree(project.id, "two-claims-wt");
    const plan = await seedPlan(worktree.id, "Two Claims Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    await seedTask(phase.id, "Task A", 1);
    await seedTask(phase.id, "Task B", 2);

    const firstRes = await claimNextTask(
      makeRequest("POST", `http://localhost/api/phases/${phase.id}/tasks/next`, {
        agentId: "agent-alpha",
      }),
      makeParams(phase.id)
    );
    const firstBody = await firstRes.json();

    const secondRes = await claimNextTask(
      makeRequest("POST", `http://localhost/api/phases/${phase.id}/tasks/next`, {
        agentId: "agent-beta",
      }),
      makeParams(phase.id)
    );
    const secondBody = await secondRes.json();

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(200);
    expect(firstBody.id).not.toBe(secondBody.id);
    expect(firstBody.subject).toBe("Task A");
    expect(secondBody.subject).toBe("Task B");
  });
});

// ---------------------------------------------------------------------------
// GET /api/tasks/[id] — get task
// ---------------------------------------------------------------------------

describe("GET /api/tasks/[id]", () => {
  it("returns the task", async () => {
    const project = await seedProject("get-task-project");
    const worktree = await seedWorktree(project.id, "get-task-wt");
    const plan = await seedPlan(worktree.id, "Get Task Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Readable task", 1);

    const res = await getTask(
      makeRequest("GET", `http://localhost/api/tasks/${task.id}`),
      makeParams(task.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe(task.id);
    expect(body.subject).toBe("Readable task");
    expect(body.phaseId).toBe(phase.id);
  });

  it("returns 404 for a non-existent task", async () => {
    const res = await getTask(
      makeRequest("GET", "http://localhost/api/tasks/ghost-task"),
      makeParams("ghost-task")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/tasks/[id] — update task
// ---------------------------------------------------------------------------

describe("PATCH /api/tasks/[id]", () => {
  it("updates the task status", async () => {
    const project = await seedProject("patch-task-status-project");
    const worktree = await seedWorktree(project.id, "patch-task-status-wt");
    const plan = await seedPlan(worktree.id, "Patch Task Status Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Status task", 1);

    const res = await patchTask(
      makeRequest("PATCH", `http://localhost/api/tasks/${task.id}`, {
        status: "IN_PROGRESS",
      }),
      makeParams(task.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("IN_PROGRESS");
  });

  it("updates the result text", async () => {
    const project = await seedProject("patch-task-result-project");
    const worktree = await seedWorktree(project.id, "patch-task-result-wt");
    const plan = await seedPlan(worktree.id, "Patch Task Result Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Result task", 1);

    const res = await patchTask(
      makeRequest("PATCH", `http://localhost/api/tasks/${task.id}`, {
        result: "Completed successfully with output XYZ",
      }),
      makeParams(task.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.result).toBe("Completed successfully with output XYZ");
  });

  it("returns 400 for an invalid status value", async () => {
    const project = await seedProject("patch-task-bad-status-project");
    const worktree = await seedWorktree(project.id, "patch-task-bad-status-wt");
    const plan = await seedPlan(worktree.id, "Bad Status Task Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Bad status task", 1);

    const res = await patchTask(
      makeRequest("PATCH", `http://localhost/api/tasks/${task.id}`, {
        status: "NOT_A_REAL_STATUS",
      }),
      makeParams(task.id)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid status/i);
  });

  it("returns 404 for a non-existent task", async () => {
    const res = await patchTask(
      makeRequest("PATCH", "http://localhost/api/tasks/ghost-task", {
        status: "COMPLETED",
      }),
      makeParams("ghost-task")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/tasks/[id] — delete task
// ---------------------------------------------------------------------------

describe("DELETE /api/tasks/[id]", () => {
  it("deletes the task and returns 204", async () => {
    const project = await seedProject("delete-task-project");
    const worktree = await seedWorktree(project.id, "delete-task-wt");
    const plan = await seedPlan(worktree.id, "Delete Task Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Doomed task", 1);

    const deleteRes = await deleteTask(
      makeRequest("DELETE", `http://localhost/api/tasks/${task.id}`),
      makeParams(task.id)
    );

    expect(deleteRes.status).toBe(204);

    const getRes = await getTask(
      makeRequest("GET", `http://localhost/api/tasks/${task.id}`),
      makeParams(task.id)
    );
    expect(getRes.status).toBe(404);
  });

  it("returns 404 for a non-existent task", async () => {
    const res = await deleteTask(
      makeRequest("DELETE", "http://localhost/api/tasks/ghost-task"),
      makeParams("ghost-task")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// POST /api/tasks/[id]/complete — complete task
// ---------------------------------------------------------------------------

describe("POST /api/tasks/[id]/complete", () => {
  it("sets status to COMPLETED with result text", async () => {
    const project = await seedProject("complete-task-result-project");
    const worktree = await seedWorktree(project.id, "complete-task-result-wt");
    const plan = await seedPlan(worktree.id, "Complete Task Result Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Task to complete", 1);

    const res = await completeTask(
      makeRequest("POST", `http://localhost/api/tasks/${task.id}/complete`, {
        result: "All checks passed",
      }),
      makeParams(task.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("COMPLETED");
    expect(body.result).toBe("All checks passed");
  });

  it("sets status to COMPLETED without result", async () => {
    const project = await seedProject("complete-task-no-result-project");
    const worktree = await seedWorktree(project.id, "complete-task-no-result-wt");
    const plan = await seedPlan(worktree.id, "Complete Task No Result Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Task to complete quietly", 1);

    const res = await completeTask(
      makeRequest("POST", `http://localhost/api/tasks/${task.id}/complete`),
      makeParams(task.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("COMPLETED");
    expect(body.result).toBeNull();
  });

  it("returns 404 for a non-existent task", async () => {
    const res = await completeTask(
      makeRequest("POST", "http://localhost/api/tasks/ghost-task/complete"),
      makeParams("ghost-task")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// POST /api/tasks/[id]/fail — fail task
// ---------------------------------------------------------------------------

describe("POST /api/tasks/[id]/fail", () => {
  it("sets status to FAILED with reason stored in result field", async () => {
    const project = await seedProject("fail-task-reason-project");
    const worktree = await seedWorktree(project.id, "fail-task-reason-wt");
    const plan = await seedPlan(worktree.id, "Fail Task Reason Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Task to fail", 1);

    const res = await failTask(
      makeRequest("POST", `http://localhost/api/tasks/${task.id}/fail`, {
        reason: "Database connection timed out",
      }),
      makeParams(task.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("FAILED");
    expect(body.result).toBe("Database connection timed out");
  });

  it("sets status to FAILED without reason", async () => {
    const project = await seedProject("fail-task-no-reason-project");
    const worktree = await seedWorktree(project.id, "fail-task-no-reason-wt");
    const plan = await seedPlan(worktree.id, "Fail Task No Reason Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Task to fail silently", 1);

    const res = await failTask(
      makeRequest("POST", `http://localhost/api/tasks/${task.id}/fail`),
      makeParams(task.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("FAILED");
    expect(body.result).toBeNull();
  });

  it("returns 404 for a non-existent task", async () => {
    const res = await failTask(
      makeRequest("POST", "http://localhost/api/tasks/ghost-task/fail"),
      makeParams("ghost-task")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// GET /api/tasks/active — active tasks
// ---------------------------------------------------------------------------

describe("GET /api/tasks/active", () => {
  it("returns only IN_PROGRESS tasks", async () => {
    const project = await seedProject("active-tasks-filter-project");
    const worktree = await seedWorktree(project.id, "active-tasks-filter-wt");
    const plan = await seedPlan(worktree.id, "Active Tasks Filter Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    await seedTask(phase.id, "Pending task", 1, { status: "PENDING" });
    await seedTask(phase.id, "Active task", 2, { status: "IN_PROGRESS", agentId: "agent-x" });
    await seedTask(phase.id, "Done task", 3, { status: "COMPLETED" });

    const res = await getActiveTasks();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].subject).toBe("Active task");
    expect(body[0].status).toBe("IN_PROGRESS");
  });

  it("returns an empty array when no active tasks exist", async () => {
    const res = await getActiveTasks();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });

  it("includes phase and plan context for each active task", async () => {
    const project = await seedProject("active-tasks-context-project");
    const worktree = await seedWorktree(project.id, "active-tasks-context-wt");
    const plan = await seedPlan(worktree.id, "Context Plan");
    const phase = await seedPhase(plan.id, "Context Phase", 1);
    await seedTask(phase.id, "Contextual task", 1, {
      status: "IN_PROGRESS",
      agentId: "agent-ctx",
    });

    const res = await getActiveTasks();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    const task = body[0];
    expect(task.phase.id).toBe(phase.id);
    expect(task.phase.name).toBe("Context Phase");
    expect(task.phase.plan.id).toBe(plan.id);
    expect(task.phase.plan.title).toBe("Context Plan");
    expect(task.phase.plan.worktree.id).toBe(worktree.id);
    expect(task.phase.plan.worktree.project.id).toBe(project.id);
  });
});
