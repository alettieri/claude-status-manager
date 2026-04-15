import { prisma } from "@/lib/prisma";

export async function getAllProjects() {
  return prisma.project.findMany({
    orderBy: { createdAt: "asc" },
  });
}

export async function getAllProjectsWithWorktrees() {
  return prisma.project.findMany({
    include: {
      _count: { select: { worktrees: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}
