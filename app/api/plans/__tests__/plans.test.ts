import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { PrismaClient } from "@/prisma/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { GET as getPlanForWorktree, POST as createPlan } from "../../worktrees/[id]/plan/route";
import { POST as importPlan } from "../../worktrees/[id]/plan/import/route";
import { GET as exportPlan } from "../../worktrees/[id]/plan/export/route";
import { GET as getPlan, PATCH as patchPlan, DELETE as deletePlan } from "../[id]/route";
import { GET as listPhases, POST as addPhase } from "../[id]/phases/route";
import { GET as getPhase, PATCH as patchPhase, DELETE as deletePhase } from "../../phases/[id]/route";

// ---------------------------------------------------------------------------
// Shared Prisma client for seeding test data
// ---------------------------------------------------------------------------

const adapter = new PrismaPg({
  connectionString: "postgresql://sm:sm_local@localhost:5434/status_manager_test",
});
const prisma = new PrismaClient({ adapter });

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

async function seedProject(name = "test-project") {
  return prisma.project.create({
    data: { name, basePath: `/tmp/${name}` },
  });
}

async function seedWorktree(
  projectId: string,
  name = "test-wt",
  overrides: Record<string, unknown> = {}
) {
  return prisma.worktree.create({
    data: {
      projectId,
      name,
      path: `/tmp/${name}`,
      branch: "main",
      ...overrides,
    },
  });
}

async function seedPlan(worktreeId: string, title = "Test Plan") {
  return prisma.plan.create({ data: { worktreeId, title } });
}

async function seedPhase(
  planId: string,
  name: string,
  order: number,
  overrides: Record<string, unknown> = {}
) {
  return prisma.phase.create({ data: { planId, name, order, ...overrides } });
}

const SAMPLE_MARKDOWN = `# Plan: Test Plan

## Architectural decisions

Use REST API. PostgreSQL for storage.

---

## Phase 1: Setup
**Status**: complete

**User stories**: As a dev, I can set up the project.

### What to build
Set up the database and API routes.

### Acceptance criteria
- [x] Database is running
- [x] API routes respond

---

## Phase 2: Features
**Status**: pending

### What to build
Build the feature layer.

### Acceptance criteria
- [ ] Feature A works
- [ ] Feature B works
`;

// ---------------------------------------------------------------------------
// POST /api/worktrees/[id]/plan — create plan
// ---------------------------------------------------------------------------

describe("POST /api/worktrees/[id]/plan", () => {
  it("creates a plan with a title and returns 201", async () => {
    const project = await seedProject("create-plan-project");
    const worktree = await seedWorktree(project.id, "create-plan-wt");

    const res = await createPlan(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/plan`, {
        title: "My Plan",
      }),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.id).toBeTruthy();
    expect(body.worktreeId).toBe(worktree.id);
    expect(body.title).toBe("My Plan");
    expect(body.phases).toEqual([]);
  });

  it("auto-advances worktree stage to PLAN when stage is below PLAN", async () => {
    const project = await seedProject("stage-advance-project");
    const worktree = await seedWorktree(project.id, "stage-advance-wt", { stage: "PRD" });

    await createPlan(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/plan`, {
        title: "Advancing Plan",
      }),
      makeParams(worktree.id)
    );

    const updated = await prisma.worktree.findUnique({ where: { id: worktree.id } });
    expect(updated!.stage).toBe("PLAN");
  });

  it("does not change worktree stage when already at PLAN", async () => {
    const project = await seedProject("stage-no-change-plan-project");
    const worktree = await seedWorktree(project.id, "stage-no-change-plan-wt", {
      stage: "PLAN",
    });
    // Create via Prisma directly so the worktree has a different plan than what we POST
    // We just need the stage to stay PLAN after this create
    await deletePlanIfExists(worktree.id);

    const res = await createPlan(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/plan`, {
        title: "Already at PLAN",
      }),
      makeParams(worktree.id)
    );
    expect(res.status).toBe(201);

    const updated = await prisma.worktree.findUnique({ where: { id: worktree.id } });
    expect(updated!.stage).toBe("PLAN");
  });

  it("does not change worktree stage when already at EXECUTING", async () => {
    const project = await seedProject("stage-executing-project");
    const worktree = await seedWorktree(project.id, "stage-executing-wt", {
      stage: "EXECUTING",
    });

    const res = await createPlan(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/plan`, {
        title: "Already Executing",
      }),
      makeParams(worktree.id)
    );
    expect(res.status).toBe(201);

    const updated = await prisma.worktree.findUnique({ where: { id: worktree.id } });
    expect(updated!.stage).toBe("EXECUTING");
  });

  it("returns 409 when a plan already exists for the worktree", async () => {
    const project = await seedProject("plan-conflict-project");
    const worktree = await seedWorktree(project.id, "plan-conflict-wt");
    await seedPlan(worktree.id, "Existing Plan");

    const res = await createPlan(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/plan`, {
        title: "Duplicate Plan",
      }),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/already exists/i);
  });

  it("returns 404 when worktree does not exist", async () => {
    const res = await createPlan(
      makeRequest("POST", "http://localhost/api/worktrees/ghost-wt/plan", {
        title: "Ghost Plan",
      }),
      makeParams("ghost-wt")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 400 when title is missing", async () => {
    const project = await seedProject("missing-title-project");
    const worktree = await seedWorktree(project.id, "missing-title-wt");

    const res = await createPlan(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/plan`, {}),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/title/i);
  });
});

// ---------------------------------------------------------------------------
// GET /api/worktrees/[id]/plan — get plan for worktree
// ---------------------------------------------------------------------------

describe("GET /api/worktrees/[id]/plan", () => {
  it("returns the plan with phases", async () => {
    const project = await seedProject("get-wt-plan-project");
    const worktree = await seedWorktree(project.id, "get-wt-plan-wt");
    const plan = await seedPlan(worktree.id, "Readable Plan");
    await seedPhase(plan.id, "Phase One", 1);
    await seedPhase(plan.id, "Phase Two", 2);

    const res = await getPlanForWorktree(
      makeRequest("GET", `http://localhost/api/worktrees/${worktree.id}/plan`),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe(plan.id);
    expect(body.title).toBe("Readable Plan");
    expect(body.phases).toHaveLength(2);
    expect(body.phases[0].name).toBe("Phase One");
    expect(body.phases[1].name).toBe("Phase Two");
  });

  it("returns 404 when worktree does not exist", async () => {
    const res = await getPlanForWorktree(
      makeRequest("GET", "http://localhost/api/worktrees/ghost-wt/plan"),
      makeParams("ghost-wt")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 404 when the worktree has no plan", async () => {
    const project = await seedProject("no-plan-project");
    const worktree = await seedWorktree(project.id, "no-plan-wt");

    const res = await getPlanForWorktree(
      makeRequest("GET", `http://localhost/api/worktrees/${worktree.id}/plan`),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// POST /api/worktrees/[id]/plan/import — import markdown plan
// ---------------------------------------------------------------------------

describe("POST /api/worktrees/[id]/plan/import", () => {
  it("imports a plan from markdown content string", async () => {
    const project = await seedProject("import-plan-project");
    const worktree = await seedWorktree(project.id, "import-plan-wt");

    const res = await importPlan(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/plan/import`, {
        content: SAMPLE_MARKDOWN,
      }),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.title).toBe("Test Plan");
  });

  it("extracts architectural notes from the markdown", async () => {
    const project = await seedProject("import-arch-project");
    const worktree = await seedWorktree(project.id, "import-arch-wt");

    const res = await importPlan(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/plan/import`, {
        content: SAMPLE_MARKDOWN,
      }),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.architecturalNotes).toContain("Use REST API");
    expect(body.architecturalNotes).toContain("PostgreSQL for storage");
  });

  it("parses phases with correct name, order, and status", async () => {
    const project = await seedProject("import-phases-project");
    const worktree = await seedWorktree(project.id, "import-phases-wt");

    const res = await importPlan(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/plan/import`, {
        content: SAMPLE_MARKDOWN,
      }),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.phases).toHaveLength(2);
    expect(body.phases[0].name).toBe("Setup");
    expect(body.phases[0].order).toBe(1);
    expect(body.phases[0].status).toBe("COMPLETED");
    expect(body.phases[1].name).toBe("Features");
    expect(body.phases[1].order).toBe(2);
    expect(body.phases[1].status).toBe("PENDING");
  });

  it("stores phase description and acceptance criteria", async () => {
    const project = await seedProject("import-criteria-project");
    const worktree = await seedWorktree(project.id, "import-criteria-wt");

    const res = await importPlan(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/plan/import`, {
        content: SAMPLE_MARKDOWN,
      }),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    const phase1 = body.phases[0];
    expect(phase1.description).toContain("Set up the database");
    expect(phase1.acceptanceCriteria).toContain("Database is running");
    expect(phase1.acceptanceCriteria).toContain("API routes respond");
  });

  it("auto-advances worktree stage to PLAN", async () => {
    const project = await seedProject("import-stage-project");
    const worktree = await seedWorktree(project.id, "import-stage-wt", { stage: "IDEA" });

    await importPlan(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/plan/import`, {
        content: SAMPLE_MARKDOWN,
      }),
      makeParams(worktree.id)
    );

    const updated = await prisma.worktree.findUnique({ where: { id: worktree.id } });
    expect(updated!.stage).toBe("PLAN");
  });

  it("returns 409 when a plan already exists", async () => {
    const project = await seedProject("import-conflict-project");
    const worktree = await seedWorktree(project.id, "import-conflict-wt");
    await seedPlan(worktree.id, "Existing Plan");

    const res = await importPlan(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/plan/import`, {
        content: SAMPLE_MARKDOWN,
      }),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/already exists/i);
  });

  it("returns 400 when neither filePath nor content is provided", async () => {
    const project = await seedProject("import-missing-source-project");
    const worktree = await seedWorktree(project.id, "import-missing-source-wt");

    const res = await importPlan(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/plan/import`, {}),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/filePath or content/i);
  });

  it("creates AcceptanceCriterion rows for task-level criteria on import", async () => {
    const project = await seedProject("import-task-criteria-project");
    const worktree = await seedWorktree(project.id, "import-task-criteria-wt");

    const markdown = `# Plan: Task Criteria Plan

---

## Phase 1: Implementation
**Status**: pending

#### Tasks

1. **Build the widget**
   Do the work.

   #### Acceptance criteria
   - [ ] Widget renders correctly
   - [x] Widget is accessible

2. **Write tests**
   Cover all cases.

`;

    await importPlan(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/plan/import`, {
        content: markdown,
      }),
      makeParams(worktree.id)
    );

    const plan = await prisma.plan.findUnique({
      where: { worktreeId: worktree.id },
      include: {
        phases: {
          include: {
            tasks: {
              include: { criteria: { orderBy: { order: "asc" } } },
              orderBy: { order: "asc" },
            },
          },
        },
      },
    });

    expect(plan).not.toBeNull();
    const tasks = plan!.phases[0].tasks;
    expect(tasks).toHaveLength(2);

    const taskOne = tasks[0];
    expect(taskOne.subject).toBe("Build the widget");
    expect(taskOne.criteria).toHaveLength(2);
    expect(taskOne.criteria[0]).toMatchObject({ text: "Widget renders correctly", checked: false, order: 1 });
    expect(taskOne.criteria[1]).toMatchObject({ text: "Widget is accessible", checked: true, order: 2 });
  });

  it("preserves criterion order matching markdown position on import", async () => {
    const project = await seedProject("import-criteria-order-project");
    const worktree = await seedWorktree(project.id, "import-criteria-order-wt");

    const markdown = `# Plan: Order Plan

---

## Phase 1: Phase
**Status**: pending

#### Tasks

1. **Task with ordered criteria**

   #### Acceptance criteria
   - [ ] First criterion
   - [ ] Second criterion
   - [x] Third criterion

`;

    await importPlan(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/plan/import`, {
        content: markdown,
      }),
      makeParams(worktree.id)
    );

    const plan = await prisma.plan.findUnique({
      where: { worktreeId: worktree.id },
      include: {
        phases: {
          include: {
            tasks: {
              include: { criteria: { orderBy: { order: "asc" } } },
            },
          },
        },
      },
    });

    const criteria = plan!.phases[0].tasks[0].criteria;
    expect(criteria).toHaveLength(3);
    expect(criteria[0]).toMatchObject({ text: "First criterion", order: 1 });
    expect(criteria[1]).toMatchObject({ text: "Second criterion", order: 2 });
    expect(criteria[2]).toMatchObject({ text: "Third criterion", order: 3, checked: true });
  });

  it("imports successfully when tasks have no acceptance criteria", async () => {
    const project = await seedProject("import-no-task-criteria-project");
    const worktree = await seedWorktree(project.id, "import-no-task-criteria-wt");

    const markdown = `# Plan: No Task Criteria Plan

---

## Phase 1: Phase
**Status**: pending

#### Tasks

1. **Task without criteria**
   Just description, no criteria block.

2. **Another task**

`;

    const res = await importPlan(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/plan/import`, {
        content: markdown,
      }),
      makeParams(worktree.id)
    );

    expect(res.status).toBe(201);

    const plan = await prisma.plan.findUnique({
      where: { worktreeId: worktree.id },
      include: {
        phases: {
          include: {
            tasks: {
              include: { criteria: true },
              orderBy: { order: "asc" },
            },
          },
        },
      },
    });

    expect(plan).not.toBeNull();
    const tasks = plan!.phases[0].tasks;
    expect(tasks).toHaveLength(2);
    expect(tasks[0].criteria).toHaveLength(0);
    expect(tasks[1].criteria).toHaveLength(0);
  });

  it("does not create AcceptanceCriterion rows when the plan has no tasks", async () => {
    const project = await seedProject("import-no-tasks-project");
    const worktree = await seedWorktree(project.id, "import-no-tasks-wt");

    const markdown = `# Plan: No Tasks Plan

---

## Phase 1: Phase
**Status**: pending

### What to build
Just a description, no tasks.

### Acceptance criteria
- [ ] Phase-level criterion

`;

    const res = await importPlan(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/plan/import`, {
        content: markdown,
      }),
      makeParams(worktree.id)
    );

    expect(res.status).toBe(201);

    const criteriaCount = await prisma.acceptanceCriterion.count({
      where: {
        task: {
          phase: {
            plan: { worktreeId: worktree.id },
          },
        },
      },
    });
    expect(criteriaCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GET /api/worktrees/[id]/plan/export — export plan as markdown
// ---------------------------------------------------------------------------

describe("GET /api/worktrees/[id]/plan/export", () => {
  it("exports the plan as a markdown string", async () => {
    const project = await seedProject("export-plan-project");
    const worktree = await seedWorktree(project.id, "export-plan-wt");
    const plan = await seedPlan(worktree.id, "Exported Plan");
    await seedPhase(plan.id, "Alpha Phase", 1, { status: "PENDING" });

    const res = await exportPlan(
      makeRequest("GET", `http://localhost/api/worktrees/${worktree.id}/plan/export`),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(typeof body.markdown).toBe("string");
    expect(body.markdown).toContain("# Plan: Exported Plan");
    expect(body.markdown).toContain("Alpha Phase");
  });

  it("includes phase status, description, and acceptance criteria in markdown", async () => {
    const project = await seedProject("export-details-project");
    const worktree = await seedWorktree(project.id, "export-details-wt");
    const plan = await seedPlan(worktree.id, "Detailed Plan");
    await seedPhase(plan.id, "Detail Phase", 1, {
      status: "IN_PROGRESS",
      description: "Build the thing",
      acceptanceCriteria: "- [ ] Thing is built",
    });

    const res = await exportPlan(
      makeRequest("GET", `http://localhost/api/worktrees/${worktree.id}/plan/export`),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.markdown).toContain("in_progress");
    expect(body.markdown).toContain("Build the thing");
    expect(body.markdown).toContain("Thing is built");
  });

  it("returns 404 when the worktree has no plan", async () => {
    const project = await seedProject("export-no-plan-project");
    const worktree = await seedWorktree(project.id, "export-no-plan-wt");

    const res = await exportPlan(
      makeRequest("GET", `http://localhost/api/worktrees/${worktree.id}/plan/export`),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// GET /api/plans/[id] — get plan by ID
// ---------------------------------------------------------------------------

describe("GET /api/plans/[id]", () => {
  it("returns the plan with phases and task counts", async () => {
    const project = await seedProject("get-plan-by-id-project");
    const worktree = await seedWorktree(project.id, "get-plan-by-id-wt");
    const plan = await seedPlan(worktree.id, "By-ID Plan");
    const phase = await seedPhase(plan.id, "Only Phase", 1);
    await prisma.task.create({
      data: { phaseId: phase.id, subject: "task-1", order: 1 },
    });

    const res = await getPlan(
      makeRequest("GET", `http://localhost/api/plans/${plan.id}`),
      makeParams(plan.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe(plan.id);
    expect(body.title).toBe("By-ID Plan");
    expect(body.phases).toHaveLength(1);
    expect(body.phases[0]._count.tasks).toBe(1);
  });

  it("returns 404 for a non-existent plan", async () => {
    const res = await getPlan(
      makeRequest("GET", "http://localhost/api/plans/ghost-plan"),
      makeParams("ghost-plan")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/plans/[id] — update plan
// ---------------------------------------------------------------------------

describe("PATCH /api/plans/[id]", () => {
  it("updates the plan title", async () => {
    const project = await seedProject("patch-plan-title-project");
    const worktree = await seedWorktree(project.id, "patch-plan-title-wt");
    const plan = await seedPlan(worktree.id, "Old Title");

    const res = await patchPlan(
      makeRequest("PATCH", `http://localhost/api/plans/${plan.id}`, {
        title: "New Title",
      }),
      makeParams(plan.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.title).toBe("New Title");
  });

  it("updates the plan status", async () => {
    const project = await seedProject("patch-plan-status-project");
    const worktree = await seedWorktree(project.id, "patch-plan-status-wt");
    const plan = await seedPlan(worktree.id, "Status Plan");

    const res = await patchPlan(
      makeRequest("PATCH", `http://localhost/api/plans/${plan.id}`, {
        status: "ACTIVE",
      }),
      makeParams(plan.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ACTIVE");
  });

  it("returns 400 for an invalid status value", async () => {
    const project = await seedProject("patch-plan-bad-status-project");
    const worktree = await seedWorktree(project.id, "patch-plan-bad-status-wt");
    const plan = await seedPlan(worktree.id, "Bad Status Plan");

    const res = await patchPlan(
      makeRequest("PATCH", `http://localhost/api/plans/${plan.id}`, {
        status: "INVALID_STATUS",
      }),
      makeParams(plan.id)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid status/i);
  });

  it("returns 404 for a non-existent plan", async () => {
    const res = await patchPlan(
      makeRequest("PATCH", "http://localhost/api/plans/ghost-plan", {
        title: "Ghost Update",
      }),
      makeParams("ghost-plan")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/plans/[id] — delete plan
// ---------------------------------------------------------------------------

describe("DELETE /api/plans/[id]", () => {
  it("deletes the plan and returns 204", async () => {
    const project = await seedProject("delete-plan-project");
    const worktree = await seedWorktree(project.id, "delete-plan-wt");
    const plan = await seedPlan(worktree.id, "Doomed Plan");

    const deleteRes = await deletePlan(
      makeRequest("DELETE", `http://localhost/api/plans/${plan.id}`),
      makeParams(plan.id)
    );

    expect(deleteRes.status).toBe(204);

    const getRes = await getPlan(
      makeRequest("GET", `http://localhost/api/plans/${plan.id}`),
      makeParams(plan.id)
    );
    expect(getRes.status).toBe(404);
  });

  it("returns 404 for a non-existent plan", async () => {
    const res = await deletePlan(
      makeRequest("DELETE", "http://localhost/api/plans/ghost-plan"),
      makeParams("ghost-plan")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// GET /api/plans/[id]/phases — list phases
// ---------------------------------------------------------------------------

describe("GET /api/plans/[id]/phases", () => {
  it("returns phases ordered by the order field", async () => {
    const project = await seedProject("list-phases-project");
    const worktree = await seedWorktree(project.id, "list-phases-wt");
    const plan = await seedPlan(worktree.id, "Phases Plan");
    await seedPhase(plan.id, "Third", 3);
    await seedPhase(plan.id, "First", 1);
    await seedPhase(plan.id, "Second", 2);

    const res = await listPhases(
      makeRequest("GET", `http://localhost/api/plans/${plan.id}/phases`),
      makeParams(plan.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(3);
    expect(body[0].name).toBe("First");
    expect(body[1].name).toBe("Second");
    expect(body[2].name).toBe("Third");
  });

  it("returns 404 when the plan does not exist", async () => {
    const res = await listPhases(
      makeRequest("GET", "http://localhost/api/plans/ghost-plan/phases"),
      makeParams("ghost-plan")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// POST /api/plans/[id]/phases — add phase
// ---------------------------------------------------------------------------

describe("POST /api/plans/[id]/phases", () => {
  it("creates a phase with name and order and returns 201", async () => {
    const project = await seedProject("add-phase-project");
    const worktree = await seedWorktree(project.id, "add-phase-wt");
    const plan = await seedPlan(worktree.id, "Add Phase Plan");

    const res = await addPhase(
      makeRequest("POST", `http://localhost/api/plans/${plan.id}/phases`, {
        name: "New Phase",
        order: 1,
      }),
      makeParams(plan.id)
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.id).toBeTruthy();
    expect(body.planId).toBe(plan.id);
    expect(body.name).toBe("New Phase");
    expect(body.order).toBe(1);
    expect(body.status).toBe("PENDING");
  });

  it("returns 400 when name is missing", async () => {
    const project = await seedProject("add-phase-no-name-project");
    const worktree = await seedWorktree(project.id, "add-phase-no-name-wt");
    const plan = await seedPlan(worktree.id, "No Name Plan");

    const res = await addPhase(
      makeRequest("POST", `http://localhost/api/plans/${plan.id}/phases`, { order: 1 }),
      makeParams(plan.id)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/name/i);
  });

  it("returns 400 when order is not a positive integer", async () => {
    const project = await seedProject("add-phase-bad-order-project");
    const worktree = await seedWorktree(project.id, "add-phase-bad-order-wt");
    const plan = await seedPlan(worktree.id, "Bad Order Plan");

    const resZero = await addPhase(
      makeRequest("POST", `http://localhost/api/plans/${plan.id}/phases`, {
        name: "Phase",
        order: 0,
      }),
      makeParams(plan.id)
    );
    expect(resZero.status).toBe(400);
    const bodyZero = await resZero.json();
    expect(bodyZero.error).toMatch(/order/i);

    const resFloat = await addPhase(
      makeRequest("POST", `http://localhost/api/plans/${plan.id}/phases`, {
        name: "Phase",
        order: 1.5,
      }),
      makeParams(plan.id)
    );
    expect(resFloat.status).toBe(400);
  });

  it("returns 404 when the plan does not exist", async () => {
    const res = await addPhase(
      makeRequest("POST", "http://localhost/api/plans/ghost-plan/phases", {
        name: "Ghost Phase",
        order: 1,
      }),
      makeParams("ghost-plan")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// GET /api/phases/[id] — get phase
// ---------------------------------------------------------------------------

describe("GET /api/phases/[id]", () => {
  it("returns the phase with task count", async () => {
    const project = await seedProject("get-phase-project");
    const worktree = await seedWorktree(project.id, "get-phase-wt");
    const plan = await seedPlan(worktree.id, "Get Phase Plan");
    const phase = await seedPhase(plan.id, "Target Phase", 1);
    await prisma.task.create({
      data: { phaseId: phase.id, subject: "task-a", order: 1 },
    });
    await prisma.task.create({
      data: { phaseId: phase.id, subject: "task-b", order: 2 },
    });

    const res = await getPhase(
      makeRequest("GET", `http://localhost/api/phases/${phase.id}`),
      makeParams(phase.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe(phase.id);
    expect(body.name).toBe("Target Phase");
    expect(body._count.tasks).toBe(2);
  });

  it("returns 404 for a non-existent phase", async () => {
    const res = await getPhase(
      makeRequest("GET", "http://localhost/api/phases/ghost-phase"),
      makeParams("ghost-phase")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/phases/[id] — update phase
// ---------------------------------------------------------------------------

describe("PATCH /api/phases/[id]", () => {
  it("updates the phase status", async () => {
    const project = await seedProject("patch-phase-status-project");
    const worktree = await seedWorktree(project.id, "patch-phase-status-wt");
    const plan = await seedPlan(worktree.id, "Patch Phase Plan");
    const phase = await seedPhase(plan.id, "Patch Target", 1);

    const res = await patchPhase(
      makeRequest("PATCH", `http://localhost/api/phases/${phase.id}`, {
        status: "IN_PROGRESS",
      }),
      makeParams(phase.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("IN_PROGRESS");
  });

  it("returns 400 for an invalid status value", async () => {
    const project = await seedProject("patch-phase-bad-status-project");
    const worktree = await seedWorktree(project.id, "patch-phase-bad-status-wt");
    const plan = await seedPlan(worktree.id, "Bad Status Phase Plan");
    const phase = await seedPhase(plan.id, "Bad Status Phase", 1);

    const res = await patchPhase(
      makeRequest("PATCH", `http://localhost/api/phases/${phase.id}`, {
        status: "INVALID",
      }),
      makeParams(phase.id)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid status/i);
  });

  it("returns 404 for a non-existent phase", async () => {
    const res = await patchPhase(
      makeRequest("PATCH", "http://localhost/api/phases/ghost-phase", {
        status: "COMPLETED",
      }),
      makeParams("ghost-phase")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/phases/[id] — delete phase
// ---------------------------------------------------------------------------

describe("DELETE /api/phases/[id]", () => {
  it("deletes the phase and returns 204", async () => {
    const project = await seedProject("delete-phase-project");
    const worktree = await seedWorktree(project.id, "delete-phase-wt");
    const plan = await seedPlan(worktree.id, "Delete Phase Plan");
    const phase = await seedPhase(plan.id, "Doomed Phase", 1);

    const deleteRes = await deletePhase(
      makeRequest("DELETE", `http://localhost/api/phases/${phase.id}`),
      makeParams(phase.id)
    );

    expect(deleteRes.status).toBe(204);

    const getRes = await getPhase(
      makeRequest("GET", `http://localhost/api/phases/${phase.id}`),
      makeParams(phase.id)
    );
    expect(getRes.status).toBe(404);
  });

  it("returns 404 for a non-existent phase", async () => {
    const res = await deletePhase(
      makeRequest("DELETE", "http://localhost/api/phases/ghost-phase"),
      makeParams("ghost-phase")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function deletePlanIfExists(worktreeId: string) {
  await prisma.plan.deleteMany({ where: { worktreeId } });
}
