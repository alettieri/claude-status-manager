import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handlePrismaError } from "@/lib/prisma-errors";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/tasks/:id/fail
 *
 * Convenience endpoint to mark a task as FAILED.
 * Accepts an optional { reason } string stored in the result field.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional — empty body is fine
  }

  const { reason } = (body ?? {}) as Record<string, unknown>;

  try {
    const updated = await prisma.task.update({
      where: { id },
      data: {
        status: "FAILED",
        ...(typeof reason === "string" ? { result: reason } : {}),
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    const prismaErr = handlePrismaError(err);
    if (prismaErr) return prismaErr;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
