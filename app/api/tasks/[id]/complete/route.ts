import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handlePrismaError } from "@/lib/prisma-errors";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/tasks/:id/complete
 *
 * Convenience endpoint to mark a task as COMPLETED.
 * Accepts an optional { result } string to record outcome text.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional for this endpoint — empty body is fine
  }

  const { result } = (body ?? {}) as Record<string, unknown>;

  try {
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const unmetCriteria = await prisma.acceptanceCriterion.findMany({
      where: { taskId: id, checked: false },
      select: { id: true, text: true },
      orderBy: { order: "asc" },
    });

    if (unmetCriteria.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot complete: ${unmetCriteria.length} acceptance criteria unmet`,
          unmet: unmetCriteria,
        },
        { status: 400 }
      );
    }

    const updated = await prisma.task.update({
      where: { id },
      data: {
        status: "COMPLETED",
        ...(typeof result === "string" ? { result } : {}),
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    const prismaErr = handlePrismaError(err);
    if (prismaErr) return prismaErr;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
