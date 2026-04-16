import { prisma } from "@/lib/prisma";

export async function getAllWorktreesWithProject() {
  return prisma.worktree.findMany({
    include: {
      project: { select: { name: true } },
      plan: {
        select: {
          phases: {
            select: {
              _count: { select: { tasks: true } },
              tasks: {
                select: { status: true },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getWorktreeDetail(id: string) {
  return prisma.worktree.findUnique({
    where: { id },
    include: {
      project: true,
      artifacts: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
      },
      plan: {
        include: {
          phases: {
            orderBy: { order: "asc" },
            include: {
              _count: { select: { tasks: true } },
              tasks: {
                orderBy: { order: "asc" },
              },
            },
          },
        },
      },
    },
  });
}

export async function findWorktreeByName(name: string) {
  return prisma.worktree.findUnique({ where: { name } });
}
