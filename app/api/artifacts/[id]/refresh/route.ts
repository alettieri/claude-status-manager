import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { prisma } from "@/lib/prisma";
import { handlePrismaError } from "@/lib/prisma-errors";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const artifact = await prisma.artifact.findUnique({ where: { id } });

    if (!artifact || artifact.deletedAt !== null) {
      return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
    }

    let content: string;
    try {
      content = await fs.readFile(artifact.filePath, "utf-8");
    } catch {
      return NextResponse.json(
        { error: `File not found or unreadable: ${artifact.filePath}` },
        { status: 400 }
      );
    }

    const updated = await prisma.artifact.update({
      where: { id },
      data: { content },
    });

    return NextResponse.json(updated);
  } catch (err) {
    const prismaErr = handlePrismaError(err);
    if (prismaErr) return prismaErr;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
