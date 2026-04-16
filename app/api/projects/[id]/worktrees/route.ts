import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const worktrees = await prisma.worktree.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(worktrees);
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

  const { name, path, branch } = body as Record<string, unknown>;

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (typeof path !== "string" || !path.trim()) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }
  if (typeof branch !== "string" || !branch.trim()) {
    return NextResponse.json({ error: "branch is required" }, { status: 400 });
  }

  // Verify parent project exists before attempting create
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const worktree = await prisma.worktree.create({
      data: {
        projectId: id,
        name: name.trim(),
        path: path.trim(),
        branch: branch.trim(),
      },
    });
    return NextResponse.json(worktree, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return NextResponse.json(
          { error: `Worktree '${name}' already exists` },
          { status: 409 }
        );
      }
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
