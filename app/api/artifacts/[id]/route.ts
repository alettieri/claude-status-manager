import { NextRequest, NextResponse } from "next/server";
import { ArtifactStatus } from "@/prisma/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { handlePrismaError } from "@/lib/prisma-errors";

type Params = { params: Promise<{ id: string }> };

const VALID_STATUSES = Object.values(ArtifactStatus);

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const artifact = await prisma.artifact.findUnique({
      where: { id },
    });

    if (!artifact || artifact.deletedAt !== null) {
      return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
    }

    return NextResponse.json(artifact);
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

  const { status, title } = body as Record<string, unknown>;

  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status as ArtifactStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
  }

  try {
    const existing = await prisma.artifact.findUnique({ where: { id } });
    if (!existing || existing.deletedAt !== null) {
      return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
    }

    const updated = await prisma.artifact.update({
      where: { id },
      data: {
        ...(status !== undefined ? { status: status as ArtifactStatus } : {}),
        ...(typeof title === "string" && title.trim() ? { title: title.trim() } : {}),
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
    const existing = await prisma.artifact.findUnique({ where: { id } });
    if (!existing || existing.deletedAt !== null) {
      return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
    }

    await prisma.artifact.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const prismaErr = handlePrismaError(err);
    if (prismaErr) return prismaErr;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
