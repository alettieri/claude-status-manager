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
