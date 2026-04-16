import { NextRequest, NextResponse } from "next/server";
import { WorktreeStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handlePrismaError } from "@/lib/prisma-errors";

type Params = { params: Promise<{ id: string }> };

// Ordered stages so we can check "below PLAN"
const STAGE_ORDER: WorktreeStage[] = [
  "IDEA",
  "SPEC",
  "PRD",
  "PLAN",
  "EXECUTING",
  "DONE",
];

function isBelowPlan(stage: WorktreeStage): boolean {
  return STAGE_ORDER.indexOf(stage) < STAGE_ORDER.indexOf("PLAN");
}

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
        phases: {
          orderBy: { order: "asc" },
          include: { _count: { select: { tasks: true } } },
        },
      },
    });

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    return NextResponse.json(plan);
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

  const { title, description, architecturalNotes } = body as Record<string, unknown>;

  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  try {
    const worktree = await prisma.worktree.findUnique({ where: { id } });
    if (!worktree) {
      return NextResponse.json({ error: "Worktree not found" }, { status: 404 });
    }

    // Check for existing plan — worktreeId is unique
    const existing = await prisma.plan.findUnique({ where: { worktreeId: id } });
    if (existing) {
      return NextResponse.json(
        { error: "A plan already exists for this worktree" },
        { status: 409 }
      );
    }

    const [plan] = await prisma.$transaction([
      prisma.plan.create({
        data: {
          worktreeId: id,
          title: title.trim(),
          ...(typeof description === "string" ? { description } : {}),
          ...(typeof architecturalNotes === "string" ? { architecturalNotes } : {}),
        },
        include: {
          phases: { orderBy: { order: "asc" } },
        },
      }),
      // Auto-advance stage to PLAN if currently below it
      ...(isBelowPlan(worktree.stage)
        ? [
            prisma.worktree.update({
              where: { id },
              data: { stage: WorktreeStage.PLAN },
            }),
          ]
        : []),
    ]);

    return NextResponse.json(plan, { status: 201 });
  } catch (err) {
    const prismaErr = handlePrismaError(err);
    if (prismaErr) return prismaErr;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
