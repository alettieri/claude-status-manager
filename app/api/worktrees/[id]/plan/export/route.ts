import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exportPlanToMarkdown } from "@/lib/plan-parser";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const worktree = await prisma.worktree.findUnique({ where: { id } });
    if (!worktree) {
      return NextResponse.json({ error: "Worktree not found" }, { status: 404 });
    }

    const plan = await prisma.plan.findUnique({
      where: { worktreeId: id },
      include: {
        phases: { orderBy: { order: "asc" } },
      },
    });

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const markdown = exportPlanToMarkdown(plan);

    return NextResponse.json({ markdown });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
