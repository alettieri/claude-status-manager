import { NextRequest, NextResponse } from "next/server";
import { Prisma, WorktreeStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const VALID_STAGES = Object.values(WorktreeStage);

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const worktree = await prisma.worktree.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        artifacts: {
          where: { deletedAt: null },
          select: { id: true, type: true, title: true, status: true, filePath: true },
          orderBy: { createdAt: "asc" },
        },
        plan: {
          select: {
            id: true,
            title: true,
            status: true,
            _count: { select: { phases: true } },
          },
        },
      },
    });

    if (!worktree) {
      return NextResponse.json({ error: "Worktree not found" }, { status: 404 });
    }

    return NextResponse.json(worktree);
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

  const { stage, name, path, branch } = body as Record<string, unknown>;

  if (stage !== undefined) {
    if (!VALID_STAGES.includes(stage as WorktreeStage)) {
      return NextResponse.json(
        { error: `Invalid stage. Must be one of: ${VALID_STAGES.join(", ")}` },
        { status: 400 }
      );
    }
  }

  try {
    const updated = await prisma.worktree.update({
      where: { id },
      data: {
        ...(stage !== undefined ? { stage: stage as WorktreeStage } : {}),
        ...(typeof name === "string" && name.trim() ? { name: name.trim() } : {}),
        ...(typeof path === "string" && path.trim() ? { path: path.trim() } : {}),
        ...(typeof branch === "string" && branch.trim() ? { branch: branch.trim() } : {}),
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return NextResponse.json({ error: "Worktree not found" }, { status: 404 });
      }
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    await prisma.worktree.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return NextResponse.json({ error: "Worktree not found" }, { status: 404 });
      }
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
