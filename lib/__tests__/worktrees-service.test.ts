import { describe, it, expect, afterAll } from "vitest";
import { PrismaClient } from "@/prisma/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getWorktreeDetail } from "@/lib/services/worktrees";

// ---------------------------------------------------------------------------
// Dedicated Prisma client for seeding — bypasses the singleton in lib/prisma
// because DATABASE_URL is set to the test DB via vitest.config.ts env
// ---------------------------------------------------------------------------

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://sm:sm_local@localhost:5434/status_manager_test",
});
const prisma = new PrismaClient({ adapter });

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildWorktreeWithPlan(suffix: string) {
  const project = await prisma.project.create({
    data: { name: `wt-svc-project-${suffix}`, basePath: `/tmp/wt-svc-${suffix}` },
  });
  const worktree = await prisma.worktree.create({
    data: {
      projectId: project.id,
      name: `wt-svc-${suffix}`,
      path: `/tmp/wt-svc-${suffix}`,
      branch: "main",
    },
  });
  const plan = await prisma.plan.create({
    data: { worktreeId: worktree.id, title: `Plan ${suffix}` },
  });
  return { project, worktree, plan };
}

async function seedPhase(planId: string, name: string, order: number) {
  return prisma.phase.create({ data: { planId, name, order } });
}

async function seedTask(phaseId: string, subject: string, order: number) {
  return prisma.task.create({ data: { phaseId, subject, order } });
}

async function seedCriterion(
  taskId: string,
  text: string,
  order: number,
  checked = false
) {
  return prisma.acceptanceCriterion.create({
    data: { taskId, text, order, checked },
  });
}

// ---------------------------------------------------------------------------
// getWorktreeDetail — criteria inclusion
// ---------------------------------------------------------------------------

describe("getWorktreeDetail — criteria in task results", () => {
  const createdProjectIds: string[] = [];

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
  });

  it("returns criteria for a task ordered by order asc", async () => {
    const { project, worktree, plan } = await buildWorktreeWithPlan("criteria-ordered");
    createdProjectIds.push(project.id);
    const phase = await seedPhase(plan.id, "Phase One", 1);
    const task = await seedTask(phase.id, "Build the thing", 1);

    await seedCriterion(task.id, "Third step", 3);
    await seedCriterion(task.id, "First step", 1);
    await seedCriterion(task.id, "Second step", 2);

    const detail = await getWorktreeDetail(worktree.id);

    const resultTask = detail!.plan!.phases[0].tasks[0];
    expect(resultTask.criteria).toHaveLength(3);
    expect(resultTask.criteria[0].text).toBe("First step");
    expect(resultTask.criteria[0].order).toBe(1);
    expect(resultTask.criteria[1].text).toBe("Second step");
    expect(resultTask.criteria[1].order).toBe(2);
    expect(resultTask.criteria[2].text).toBe("Third step");
    expect(resultTask.criteria[2].order).toBe(3);
  });

  it("returns an empty criteria array when a task has no criteria", async () => {
    const { project, worktree, plan } = await buildWorktreeWithPlan("no-criteria");
    createdProjectIds.push(project.id);
    const phase = await seedPhase(plan.id, "Phase One", 1);
    await seedTask(phase.id, "Task without criteria", 1);

    const detail = await getWorktreeDetail(worktree.id);

    const resultTask = detail!.plan!.phases[0].tasks[0];
    expect(resultTask.criteria).toEqual([]);
  });

  it("returns checked and unchecked criteria with correct boolean values", async () => {
    const { project, worktree, plan } = await buildWorktreeWithPlan("checked-state");
    createdProjectIds.push(project.id);
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Partial task", 1);

    await seedCriterion(task.id, "Done item", 1, true);
    await seedCriterion(task.id, "Pending item", 2, false);

    const detail = await getWorktreeDetail(worktree.id);

    const criteria = detail!.plan!.phases[0].tasks[0].criteria;
    expect(criteria[0].checked).toBe(true);
    expect(criteria[1].checked).toBe(false);
  });

  it("returns criteria across multiple tasks each with their own ordering", async () => {
    const { project, worktree, plan } = await buildWorktreeWithPlan("multi-task-criteria");
    createdProjectIds.push(project.id);
    const phase = await seedPhase(plan.id, "Phase", 1);
    const taskA = await seedTask(phase.id, "Task A", 1);
    const taskB = await seedTask(phase.id, "Task B", 2);

    await seedCriterion(taskA.id, "A criterion 2", 2);
    await seedCriterion(taskA.id, "A criterion 1", 1);
    await seedCriterion(taskB.id, "B criterion 1", 1);

    const detail = await getWorktreeDetail(worktree.id);

    const tasks = detail!.plan!.phases[0].tasks;
    expect(tasks[0].criteria[0].text).toBe("A criterion 1");
    expect(tasks[0].criteria[1].text).toBe("A criterion 2");
    expect(tasks[1].criteria[0].text).toBe("B criterion 1");
  });

  it("returns criteria fields: id, text, checked, order", async () => {
    const { project, worktree, plan } = await buildWorktreeWithPlan("criteria-shape");
    createdProjectIds.push(project.id);
    const phase = await seedPhase(plan.id, "Phase", 1);
    const task = await seedTask(phase.id, "Shape task", 1);

    await seedCriterion(task.id, "Has all fields", 1, true);

    const detail = await getWorktreeDetail(worktree.id);

    const criterion = detail!.plan!.phases[0].tasks[0].criteria[0];
    expect(criterion).toMatchObject({
      id: expect.any(String),
      text: "Has all fields",
      order: 1,
      checked: true,
    });
  });

  it("returns null when the worktree does not exist", async () => {
    const detail = await getWorktreeDetail("non-existent-id");
    expect(detail).toBeNull();
  });

  it("returns null plan when the worktree has no plan", async () => {
    const project = await prisma.project.create({
      data: { name: "wt-svc-no-plan", basePath: "/tmp/wt-svc-no-plan" },
    });
    createdProjectIds.push(project.id);
    const worktree = await prisma.worktree.create({
      data: {
        projectId: project.id,
        name: "wt-svc-no-plan-wt",
        path: "/tmp/wt-svc-no-plan-wt",
        branch: "main",
      },
    });

    const detail = await getWorktreeDetail(worktree.id);

    expect(detail).not.toBeNull();
    expect(detail!.plan).toBeNull();
  });
});
