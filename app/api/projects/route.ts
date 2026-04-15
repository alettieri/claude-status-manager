import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAllProjectsWithWorktrees } from "@/lib/services/projects";

export async function GET() {
  try {
    const projects = await getAllProjectsWithWorktrees();
    return NextResponse.json(projects);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, basePath, description } = body as Record<string, unknown>;

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (typeof basePath !== "string" || !basePath.trim()) {
    return NextResponse.json({ error: "basePath is required" }, { status: 400 });
  }

  try {
    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        basePath: basePath.trim(),
        description: typeof description === "string" ? description.trim() : undefined,
      },
    });
    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return NextResponse.json(
          { error: `Project '${name}' already exists` },
          { status: 409 }
        );
      }
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
