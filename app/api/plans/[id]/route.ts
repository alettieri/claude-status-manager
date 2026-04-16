import { NextRequest, NextResponse } from "next/server";
import { PlanStatus } from "@/prisma/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { handlePrismaError } from "@/lib/prisma-errors";

type Params = { params: Promise<{ id: string }> };

const VALID_STATUSES = Object.values(PlanStatus);

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const plan = await prisma.plan.findUnique({
      where: { id },
      include: {
        phases: {
          orderBy: { order: "asc" },
          include: { _count: { select: { tasks: true } } },
        },
      },
    });

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    return NextResponse.json(plan);
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

  const { title, description, architecturalNotes, status } = body as Record<string, unknown>;

  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status as PlanStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
  }

  try {
    const updated = await prisma.plan.update({
      where: { id },
      data: {
        ...(typeof title === "string" && title.trim() ? { title: title.trim() } : {}),
        ...(typeof description === "string" ? { description } : {}),
        ...(typeof architecturalNotes === "string" ? { architecturalNotes } : {}),
        ...(status !== undefined ? { status: status as PlanStatus } : {}),
      },
      include: {
        phases: { orderBy: { order: "asc" } },
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
    await prisma.plan.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const prismaErr = handlePrismaError(err);
    if (prismaErr) return prismaErr;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
