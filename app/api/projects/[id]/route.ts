import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        worktrees: {
          select: {
            id: true,
            name: true,
            branch: true,
            stage: true,
            path: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json(project);
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

  const { name, basePath, description } = body as Record<string, unknown>;

  try {
    const updated = await prisma.project.update({
      where: { id },
      data: {
        ...(typeof name === "string" && name.trim() ? { name: name.trim() } : {}),
        ...(typeof basePath === "string" && basePath.trim() ? { basePath: basePath.trim() } : {}),
        ...(typeof description === "string" ? { description: description.trim() || null } : {}),
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    await prisma.project.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
