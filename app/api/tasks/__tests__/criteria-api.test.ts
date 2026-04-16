import { describe, it, expect, afterAll, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getCriteria } from "../../tasks/[id]/criteria/route";
import { POST as checkCriterion } from "../../criteria/[id]/check/route";
import { POST as uncheckCriterion } from "../../criteria/[id]/uncheck/route";
import { POST as completeTask } from "../../tasks/[id]/complete/route";
import { prisma, seedProject, seedWorktree, seedPlan, seedPhase, seedTask } from "./test-helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, url: string): NextRequest {
  return new NextRequest(url, { method });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function seedCriterion(taskId: string, text: string, order: number, checked = false) {
  return prisma.acceptanceCriterion.create({
    data: { taskId, text, order, checked },
  });
}

// ---------------------------------------------------------------------------
// Row teardown — cascade-delete projects created during each test
// ---------------------------------------------------------------------------

const createdProjectIds: string[] = [];

const trackedSeedProject: typeof seedProject = async (name) => {
  const project = await seedProject(name);
  createdProjectIds.push(project.id);
  return project;
};

afterEach(async () => {
  if (createdProjectIds.length > 0) {
    await prisma.project.deleteMany({ where: { id: { in: [...createdProjectIds] } } });
    createdProjectIds.length = 0;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// GET /api/tasks/[id]/criteria
// ---------------------------------------------------------------------------

describe("GET /api/tasks/[id]/criteria", () => {
  it("returns criteria ordered by order asc", async () => {
    const project = await trackedSeedProject("criteria-list-project");
    const worktree = await seedWorktree(project.id, "criteria-list-wt");
    const plan = await seedPlan(worktree.id, "Criteria List Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Task with criteria", 1);

    await seedCriterion(task.id, "Third criterion", 3);
    await seedCriterion(task.id, "First criterion", 1);
    await seedCriterion(task.id, "Second criterion", 2);

    const res = await getCriteria(
      makeRequest("GET", `http://localhost/api/tasks/${task.id}/criteria`),
      makeParams(task.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(3);
    expect(body[0].text).toBe("First criterion");
    expect(body[1].text).toBe("Second criterion");
    expect(body[2].text).toBe("Third criterion");
  });

  it("returns an empty array when the task has no criteria", async () => {
    const project = await trackedSeedProject("criteria-empty-project");
    const worktree = await seedWorktree(project.id, "criteria-empty-wt");
    const plan = await seedPlan(worktree.id, "Criteria Empty Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Task without criteria", 1);

    const res = await getCriteria(
      makeRequest("GET", `http://localhost/api/tasks/${task.id}/criteria`),
      makeParams(task.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });

  it("returns 404 when the task does not exist", async () => {
    const res = await getCriteria(
      makeRequest("GET", "http://localhost/api/tasks/ghost-task/criteria"),
      makeParams("ghost-task")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// POST /api/criteria/[id]/check
// ---------------------------------------------------------------------------

describe("POST /api/criteria/[id]/check", () => {
  it("sets checked = true and returns the updated criterion", async () => {
    const project = await trackedSeedProject("check-criterion-project");
    const worktree = await seedWorktree(project.id, "check-criterion-wt");
    const plan = await seedPlan(worktree.id, "Check Criterion Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Task", 1);
    const criterion = await seedCriterion(task.id, "Must pass CI", 1, false);

    const res = await checkCriterion(
      makeRequest("POST", `http://localhost/api/criteria/${criterion.id}/check`),
      makeParams(criterion.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe(criterion.id);
    expect(body.checked).toBe(true);
  });

  it("is idempotent — checking an already-checked criterion returns it as checked", async () => {
    const project = await trackedSeedProject("check-idempotent-project");
    const worktree = await seedWorktree(project.id, "check-idempotent-wt");
    const plan = await seedPlan(worktree.id, "Check Idempotent Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Task", 1);
    const criterion = await seedCriterion(task.id, "Already checked", 1, true);

    const res = await checkCriterion(
      makeRequest("POST", `http://localhost/api/criteria/${criterion.id}/check`),
      makeParams(criterion.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.checked).toBe(true);
  });

  it("returns 404 when the criterion does not exist", async () => {
    const res = await checkCriterion(
      makeRequest("POST", "http://localhost/api/criteria/ghost-criterion/check"),
      makeParams("ghost-criterion")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// POST /api/criteria/[id]/uncheck
// ---------------------------------------------------------------------------

describe("POST /api/criteria/[id]/uncheck", () => {
  it("sets checked = false and returns the updated criterion", async () => {
    const project = await trackedSeedProject("uncheck-criterion-project");
    const worktree = await seedWorktree(project.id, "uncheck-criterion-wt");
    const plan = await seedPlan(worktree.id, "Uncheck Criterion Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Task", 1);
    const criterion = await seedCriterion(task.id, "Must pass review", 1, true);

    const res = await uncheckCriterion(
      makeRequest("POST", `http://localhost/api/criteria/${criterion.id}/uncheck`),
      makeParams(criterion.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe(criterion.id);
    expect(body.checked).toBe(false);
  });

  it("is idempotent — unchecking an already-unchecked criterion returns it as unchecked", async () => {
    const project = await trackedSeedProject("uncheck-idempotent-project");
    const worktree = await seedWorktree(project.id, "uncheck-idempotent-wt");
    const plan = await seedPlan(worktree.id, "Uncheck Idempotent Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Task", 1);
    const criterion = await seedCriterion(task.id, "Still unchecked", 1, false);

    const res = await uncheckCriterion(
      makeRequest("POST", `http://localhost/api/criteria/${criterion.id}/uncheck`),
      makeParams(criterion.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.checked).toBe(false);
  });

  it("returns 404 when the criterion does not exist", async () => {
    const res = await uncheckCriterion(
      makeRequest("POST", "http://localhost/api/criteria/ghost-criterion/uncheck"),
      makeParams("ghost-criterion")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// POST /api/tasks/[id]/complete — completion gate
// ---------------------------------------------------------------------------

describe("POST /api/tasks/[id]/complete — acceptance criteria gate", () => {
  it("returns 400 with unmet list when unchecked criteria exist", async () => {
    const project = await trackedSeedProject("complete-gate-fail-project");
    const worktree = await seedWorktree(project.id, "complete-gate-fail-wt");
    const plan = await seedPlan(worktree.id, "Complete Gate Fail Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Gated task", 1);

    await seedCriterion(task.id, "Must pass CI", 1, true);
    await seedCriterion(task.id, "Must have tests", 2, false);
    await seedCriterion(task.id, "Must be reviewed", 3, false);

    const res = await completeTask(
      makeRequest("POST", `http://localhost/api/tasks/${task.id}/complete`),
      makeParams(task.id)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/2 acceptance criteria unmet/i);
    expect(body.unmet).toHaveLength(2);
    expect(body.unmet[0].text).toBe("Must have tests");
    expect(body.unmet[1].text).toBe("Must be reviewed");
    expect(body.unmet[0]).toHaveProperty("id");
    expect(body.unmet[0]).toHaveProperty("text");
    expect(body.unmet[0]).not.toHaveProperty("checked");
    expect(body.unmet[0]).not.toHaveProperty("order");
  });

  it("succeeds when all criteria are checked", async () => {
    const project = await trackedSeedProject("complete-gate-pass-project");
    const worktree = await seedWorktree(project.id, "complete-gate-pass-wt");
    const plan = await seedPlan(worktree.id, "Complete Gate Pass Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Fully gated task", 1);

    await seedCriterion(task.id, "Must pass CI", 1, true);
    await seedCriterion(task.id, "Must have tests", 2, true);

    const res = await completeTask(
      makeRequest("POST", `http://localhost/api/tasks/${task.id}/complete`),
      makeParams(task.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("COMPLETED");
  });

  it("succeeds when the task has no criteria", async () => {
    const project = await trackedSeedProject("complete-no-criteria-project");
    const worktree = await seedWorktree(project.id, "complete-no-criteria-wt");
    const plan = await seedPlan(worktree.id, "Complete No Criteria Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Ungated task", 1);

    const res = await completeTask(
      makeRequest("POST", `http://localhost/api/tasks/${task.id}/complete`),
      makeParams(task.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("COMPLETED");
  });

  it("returns 404 when the task does not exist", async () => {
    const res = await completeTask(
      makeRequest("POST", "http://localhost/api/tasks/ghost-task-id/complete"),
      makeParams("ghost-task-id")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/task not found/i);
    expect(body).not.toHaveProperty("unmet");
  });
});
