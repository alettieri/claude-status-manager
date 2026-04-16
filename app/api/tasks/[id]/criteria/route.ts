import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handlePrismaError } from "@/lib/prisma-errors";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/tasks/:id/criteria
 *
 * Returns all acceptance criteria for the task, ordered by `order` ascending.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const task = await prisma.task.findUnique({ where: { id } });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const criteria = await prisma.acceptanceCriterion.findMany({
      where: { taskId: id },
      orderBy: { order: "asc" },
    });

    return NextResponse.json(criteria);
  } catch (err) {
    const prismaErr = handlePrismaError(err);
    if (prismaErr) return prismaErr;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
