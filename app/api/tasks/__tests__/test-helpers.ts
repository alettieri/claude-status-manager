import { PrismaClient } from "@/prisma/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ---------------------------------------------------------------------------
// Shared Prisma client for seeding test data
// ---------------------------------------------------------------------------

const adapter = new PrismaPg({
  connectionString: "postgresql://sm:sm_local@localhost:5434/status_manager_test",
});
export const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

export async function seedProject(name = "test-project") {
  return prisma.project.create({ data: { name, basePath: `/tmp/${name}` } });
}

export async function seedWorktree(projectId: string, name = "test-wt") {
  return prisma.worktree.create({
    data: { projectId, name, path: `/tmp/${name}`, branch: "main" },
  });
}

export async function seedPlan(worktreeId: string, title = "Test Plan") {
  return prisma.plan.create({ data: { worktreeId, title } });
}

export async function seedPhase(planId: string, name: string, order: number) {
  return prisma.phase.create({ data: { planId, name, order } });
}

export async function seedTask(
  phaseId: string,
  subject: string,
  order: number,
  overrides: Record<string, unknown> = {}
) {
  return prisma.task.create({
    data: { phaseId, subject, order, ...overrides },
  });
}
