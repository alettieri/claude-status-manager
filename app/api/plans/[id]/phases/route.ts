import { NextRequest, NextResponse } from "next/server";
import { PhaseStatus } from "@/prisma/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { handlePrismaError } from "@/lib/prisma-errors";

type Params = { params: Promise<{ id: string }> };

const VALID_STATUSES = Object.values(PhaseStatus);

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const plan = await prisma.plan.findUnique({ where: { id } });
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const phases = await prisma.phase.findMany({
      where: { planId: id },
      orderBy: { order: "asc" },
      include: { _count: { select: { tasks: true } } },
    });

    return NextResponse.json(phases);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, description, order, acceptanceCriteria, status } = body as Record<
    string,
    unknown
  >;

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (typeof order !== "number" || !Number.isInteger(order) || order < 1) {
    return NextResponse.json(
      { error: "order is required and must be a positive integer" },
      { status: 400 }
    );
  }
  if (status !== undefined && !VALID_STATUSES.includes(status as PhaseStatus)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const plan = await prisma.plan.findUnique({ where: { id } });
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const phase = await prisma.phase.create({
      data: {
        planId: id,
        name: name.trim(),
        order,
        ...(typeof description === "string" ? { description } : {}),
        ...(typeof acceptanceCriteria === "string" ? { acceptanceCriteria } : {}),
        ...(status !== undefined ? { status: status as PhaseStatus } : {}),
      },
    });

    return NextResponse.json(phase, { status: 201 });
  } catch (err) {
    const prismaErr = handlePrismaError(err);
    if (prismaErr) return prismaErr;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
