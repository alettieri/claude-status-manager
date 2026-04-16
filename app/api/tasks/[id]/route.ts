import { NextRequest, NextResponse } from "next/server";
import { TaskStatus } from "@/prisma/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { handlePrismaError } from "@/lib/prisma-errors";

type Params = { params: Promise<{ id: string }> };

const VALID_STATUSES = Object.values(TaskStatus);

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const task = await prisma.task.findUnique({ where: { id } });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json(task);
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

  const { status, result, agentId, subject, description } = body as Record<string, unknown>;

  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status as TaskStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
  }

  try {
    const updated = await prisma.task.update({
      where: { id },
      data: {
        ...(status !== undefined ? { status: status as TaskStatus } : {}),
        ...(typeof result === "string" ? { result } : {}),
        ...(typeof agentId === "string" ? { agentId } : {}),
        ...(typeof subject === "string" && subject.trim() ? { subject: subject.trim() } : {}),
        ...(typeof description === "string" ? { description } : {}),
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
    await prisma.task.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const prismaErr = handlePrismaError(err);
    if (prismaErr) return prismaErr;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
