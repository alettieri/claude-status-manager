import { NextRequest, NextResponse } from "next/server";
import { ArtifactType } from "@/prisma/generated/prisma/client";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { handlePrismaError } from "@/lib/prisma-errors";

type Params = { params: Promise<{ id: string }> };

const VALID_TYPES = Object.values(ArtifactType);

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const worktree = await prisma.worktree.findUnique({ where: { id } });
    if (!worktree) {
      return NextResponse.json({ error: "Worktree not found" }, { status: 404 });
    }

    const artifacts = await prisma.artifact.findMany({
      where: { worktreeId: id, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(artifacts);
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

  const { type, filePath: rawFilePath, title } = body as Record<string, unknown>;

  if (typeof type !== "string" || !VALID_TYPES.includes(type as ArtifactType)) {
    return NextResponse.json(
      { error: `type is required and must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  if (typeof rawFilePath !== "string" || !rawFilePath.trim()) {
    return NextResponse.json({ error: "filePath is required" }, { status: 400 });
  }

  try {
    const worktree = await prisma.worktree.findUnique({ where: { id } });
    if (!worktree) {
      return NextResponse.json({ error: "Worktree not found" }, { status: 404 });
    }

    const filePath = path.resolve(rawFilePath.trim());
    if (!filePath.startsWith(worktree.path + path.sep) && filePath !== worktree.path) {
      return NextResponse.json(
        { error: "filePath must be inside the worktree directory" },
        { status: 400 }
      );
    }

    // Read file content server-side
    let content: string | undefined;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch {
      return NextResponse.json(
        { error: `File not found or unreadable: ${filePath}` },
        { status: 400 }
      );
    }

    // Derive title from filename if not provided
    const derivedTitle =
      typeof title === "string" && title.trim()
        ? title.trim()
        : path.basename(filePath, path.extname(filePath)).replace(/[-_]/g, " ");

    const artifact = await prisma.artifact.create({
      data: {
        worktreeId: id,
        type: type as ArtifactType,
        filePath,
        title: derivedTitle,
        content,
      },
    });

    return NextResponse.json(artifact, { status: 201 });
  } catch (err) {
    const prismaErr = handlePrismaError(err);
    if (prismaErr) return prismaErr;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
