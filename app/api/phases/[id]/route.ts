import { NextRequest, NextResponse } from "next/server";
import { PhaseStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handlePrismaError } from "@/lib/prisma-errors";

type Params = { params: Promise<{ id: string }> };

const VALID_STATUSES = Object.values(PhaseStatus);

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const phase = await prisma.phase.findUnique({
      where: { id },
      include: { _count: { select: { tasks: true } } },
    });

    if (!phase) {
      return NextResponse.json({ error: "Phase not found" }, { status: 404 });
    }

    return NextResponse.json(phase);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { status, name, description, acceptanceCriteria } = body as Record<string, unknown>;

  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status as PhaseStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
  }

  try {
    const updated = await prisma.phase.update({
      where: { id },
      data: {
        ...(status !== undefined ? { status: status as PhaseStatus } : {}),
        ...(typeof name === "string" && name.trim() ? { name: name.trim() } : {}),
        ...(typeof description === "string" ? { description } : {}),
        ...(typeof acceptanceCriteria === "string" ? { acceptanceCriteria } : {}),
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    const prismaErr = handlePrismaError(err);
    if (prismaErr) return prismaErr;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    await prisma.phase.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const prismaErr = handlePrismaError(err);
    if (prismaErr) return prismaErr;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
