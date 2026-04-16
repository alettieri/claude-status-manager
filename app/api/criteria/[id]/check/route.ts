import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handlePrismaError } from "@/lib/prisma-errors";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/criteria/:id/check
 *
 * Sets checked = true on the acceptance criterion.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const updated = await prisma.acceptanceCriterion.update({
      where: { id },
      data: { checked: true },
    });

    return NextResponse.json(updated);
  } catch (err) {
    const prismaErr = handlePrismaError(err);
    if (prismaErr) return prismaErr;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
