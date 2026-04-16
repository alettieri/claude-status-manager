import { NextRequest, NextResponse } from "next/server";
import { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handlePrismaError } from "@/lib/prisma-errors";

type Params = { params: Promise<{ id: string }> };

const VALID_STATUSES = Object.values(TaskStatus);

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const phase = await prisma.phase.findUnique({ where: { id } });
    if (!phase) {
      return NextResponse.json({ error: "Phase not found" }, { status: 404 });
    }

    const tasks = await prisma.task.findMany({
      where: { phaseId: id },
      orderBy: { order: "asc" },
    });

    return NextResponse.json(tasks);
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

  const { subject, description, order, status } = body as Record<string, unknown>;

  if (typeof subject !== "string" || !subject.trim()) {
    return NextResponse.json({ error: "subject is required" }, { status: 400 });
  }
  if (typeof order !== "number" || !Number.isInteger(order) || order < 1) {
    return NextResponse.json(
      { error: "order is required and must be a positive integer" },
      { status: 400 }
    );
  }
  if (status !== undefined && !VALID_STATUSES.includes(status as TaskStatus)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const phase = await prisma.phase.findUnique({ where: { id } });
    if (!phase) {
      return NextResponse.json({ error: "Phase not found" }, { status: 404 });
    }

    const task = await prisma.task.create({
      data: {
        phaseId: id,
        subject: subject.trim(),
        order,
        ...(typeof description === "string" ? { description } : {}),
        ...(status !== undefined ? { status: status as TaskStatus } : {}),
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    const prismaErr = handlePrismaError(err);
    if (prismaErr) return prismaErr;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
