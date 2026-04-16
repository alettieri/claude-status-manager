import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/phases/:id/tasks/next
 *
 * Atomically claims the next pending task in the phase.
 * Uses SELECT ... FOR UPDATE SKIP LOCKED inside a transaction to prevent
 * two agents from claiming the same task under concurrent load.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id: phaseId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { agentId } = body as Record<string, unknown>;

  if (typeof agentId !== "string" || !agentId.trim()) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }

  // Verify the phase exists first
  const phase = await prisma.phase.findUnique({ where: { id: phaseId } });
  if (!phase) {
    return NextResponse.json({ error: "Phase not found" }, { status: 404 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Atomically find and claim the next pending task.
      // FOR UPDATE SKIP LOCKED ensures concurrent callers never claim the same row.
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          phaseId: string;
          subject: string;
          description: string | null;
          status: string;
          order: number;
          agentId: string | null;
          result: string | null;
          createdAt: Date;
          updatedAt: Date;
        }>
      >`
        UPDATE "Task"
        SET status = 'IN_PROGRESS', "agentId" = ${agentId.trim()}, "updatedAt" = NOW()
        WHERE id = (
          SELECT id FROM "Task"
          WHERE "phaseId" = ${phaseId} AND status = 'PENDING'
          ORDER BY "order" ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `;

      return rows[0] ?? null;
    });

    if (!result) {
      return NextResponse.json(
        { error: "No pending tasks available in this phase" },
        { status: 404 }
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
