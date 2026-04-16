import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/tasks/active
 *
 * Returns all IN_PROGRESS tasks across all projects, with phase and plan
 * context included so callers can identify which worktree/plan each task
 * belongs to.
 */
export async function GET() {
  try {
    const tasks = await prisma.task.findMany({
      where: { status: "IN_PROGRESS" },
      orderBy: { updatedAt: "desc" },
      include: {
        phase: {
          select: {
            id: true,
            name: true,
            order: true,
            plan: {
              select: {
                id: true,
                title: true,
                worktree: {
                  select: {
                    id: true,
                    name: true,
                    project: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    return NextResponse.json(tasks);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
