import { describe, it, expect, afterAll, afterEach } from "vitest";
import { prisma, seedProject, seedWorktree, seedPlan, seedPhase, seedTask } from "./test-helpers";

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
// AcceptanceCriterion — create and retrieve
// ---------------------------------------------------------------------------

describe("AcceptanceCriterion — create and retrieve", () => {
  it("creates a criterion and retrieves it via the task relation", async () => {
    const project = await trackedSeedProject("ac-create-retrieve-project");
    const worktree = await seedWorktree(project.id, "ac-create-retrieve-wt");
    const plan = await seedPlan(worktree.id, "AC Create Retrieve Plan");
    const phase = await seedPhase(plan.id, "Phase One", 1);
    const task = await seedTask(phase.id, "Task with criteria", 1);

    await prisma.acceptanceCriterion.create({
      data: { taskId: task.id, text: "Feature works end-to-end", order: 1 },
    });

    const found = await prisma.task.findUnique({
      where: { id: task.id },
      include: { criteria: true },
    });

    expect(found).not.toBeNull();
    expect(found!.criteria).toHaveLength(1);
    expect(found!.criteria[0].text).toBe("Feature works end-to-end");
    expect(found!.criteria[0].taskId).toBe(task.id);
    expect(found!.criteria[0].order).toBe(1);
  });

  it("creates multiple criteria and they are all associated with the task", async () => {
    const project = await trackedSeedProject("ac-multi-project");
    const worktree = await seedWorktree(project.id, "ac-multi-wt");
    const plan = await seedPlan(worktree.id, "AC Multi Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Multi-criteria task", 1);

    await prisma.acceptanceCriterion.createMany({
      data: [
        { taskId: task.id, text: "Criterion A", order: 1 },
        { taskId: task.id, text: "Criterion B", order: 2 },
        { taskId: task.id, text: "Criterion C", order: 3 },
      ],
    });

    const found = await prisma.task.findUnique({
      where: { id: task.id },
      include: { criteria: { orderBy: { order: "asc" } } },
    });

    expect(found!.criteria).toHaveLength(3);
    expect(found!.criteria[0].text).toBe("Criterion A");
    expect(found!.criteria[1].text).toBe("Criterion B");
    expect(found!.criteria[2].text).toBe("Criterion C");
  });

  it("rejects a duplicate order value on the same task", async () => {
    const project = await trackedSeedProject("ac-unique-order-project");
    const worktree = await seedWorktree(project.id, "ac-unique-order-wt");
    const plan = await seedPlan(worktree.id, "AC Unique Order Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Task with duplicate order", 1);

    await prisma.acceptanceCriterion.create({
      data: { taskId: task.id, text: "First criterion at order 1", order: 1 },
    });

    await expect(
      prisma.acceptanceCriterion.create({
        data: { taskId: task.id, text: "Duplicate order criterion", order: 1 },
      })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AcceptanceCriterion — default field values
// ---------------------------------------------------------------------------

describe("AcceptanceCriterion — default field values", () => {
  it("defaults checked to false when not supplied", async () => {
    const project = await trackedSeedProject("ac-default-checked-project");
    const worktree = await seedWorktree(project.id, "ac-default-checked-wt");
    const plan = await seedPlan(worktree.id, "AC Default Checked Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Unchecked task", 1);

    const criterion = await prisma.acceptanceCriterion.create({
      data: { taskId: task.id, text: "Should default to unchecked", order: 1 },
    });

    expect(criterion.checked).toBe(false);
  });

  it("persists checked as true when explicitly set", async () => {
    const project = await trackedSeedProject("ac-checked-true-project");
    const worktree = await seedWorktree(project.id, "ac-checked-true-wt");
    const plan = await seedPlan(worktree.id, "AC Checked True Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Checked task", 1);

    const criterion = await prisma.acceptanceCriterion.create({
      data: { taskId: task.id, text: "Already done", order: 1, checked: true },
    });

    expect(criterion.checked).toBe(true);
  });

  it("timestamps are set on creation", async () => {
    const project = await trackedSeedProject("ac-timestamps-project");
    const worktree = await seedWorktree(project.id, "ac-timestamps-wt");
    const plan = await seedPlan(worktree.id, "AC Timestamps Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Timestamped task", 1);

    const before = new Date();
    const criterion = await prisma.acceptanceCriterion.create({
      data: { taskId: task.id, text: "Timestamped criterion", order: 1 },
    });
    const after = new Date();

    expect(criterion.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(criterion.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(criterion.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});

// ---------------------------------------------------------------------------
// AcceptanceCriterion — cascade delete from Task
// ---------------------------------------------------------------------------

describe("AcceptanceCriterion — cascade delete from Task", () => {
  it("deletes all criteria when the parent task is deleted", async () => {
    const project = await trackedSeedProject("ac-cascade-task-project");
    const worktree = await seedWorktree(project.id, "ac-cascade-task-wt");
    const plan = await seedPlan(worktree.id, "AC Cascade Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Task with criteria", 1);

    await prisma.acceptanceCriterion.createMany({
      data: [
        { taskId: task.id, text: "First criterion", order: 1 },
        { taskId: task.id, text: "Second criterion", order: 2 },
      ],
    });

    // Confirm criteria exist before deletion
    const before = await prisma.acceptanceCriterion.findMany({
      where: { taskId: task.id },
    });
    expect(before).toHaveLength(2);

    await prisma.task.delete({ where: { id: task.id } });

    const after = await prisma.acceptanceCriterion.findMany({
      where: { taskId: task.id },
    });
    expect(after).toHaveLength(0);
  });

  it("only deletes criteria belonging to the deleted task, not those of sibling tasks", async () => {
    const project = await trackedSeedProject("ac-cascade-sibling-project");
    const worktree = await seedWorktree(project.id, "ac-cascade-sibling-wt");
    const plan = await seedPlan(worktree.id, "AC Sibling Plan");
    const phase = await seedPhase(plan.id, "Phase", 1);
    const taskA = await seedTask(phase.id, "Task A", 1);
    const taskB = await seedTask(phase.id, "Task B", 2);

    await prisma.acceptanceCriterion.create({
      data: { taskId: taskA.id, text: "Criterion for A", order: 1 },
    });
    await prisma.acceptanceCriterion.create({
      data: { taskId: taskB.id, text: "Criterion for B", order: 1 },
    });

    await prisma.task.delete({ where: { id: taskA.id } });

    const remaining = await prisma.acceptanceCriterion.findMany({
      where: { taskId: taskB.id },
    });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].text).toBe("Criterion for B");
  });
});
