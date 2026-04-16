import { beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://sm:sm_local@localhost:5434/status_manager_test",
    },
  },
});

beforeEach(async () => {
  // Delete in dependency order to respect FK constraints
  await prisma.task.deleteMany();
  await prisma.phase.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.artifact.deleteMany();
  await prisma.worktree.deleteMany();
  await prisma.project.deleteMany();
});
