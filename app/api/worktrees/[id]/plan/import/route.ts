import { NextRequest, NextResponse } from "next/server";
import { PhaseStatus, WorktreeStage } from "@/prisma/generated/prisma/client";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { parsePlan } from "@/lib/plan-parser";

type Params = { params: Promise<{ id: string }> };

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

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { filePath: rawFilePath, content: rawContent } = body as Record<string, unknown>;

  if (
    (typeof rawFilePath !== "string" || !rawFilePath.trim()) &&
    (typeof rawContent !== "string" || !rawContent.trim())
  ) {
    return NextResponse.json(
      { error: "Either filePath or content is required" },
      { status: 400 }
    );
  }

  try {
    const worktree = await prisma.worktree.findUnique({ where: { id } });
    if (!worktree) {
      return NextResponse.json({ error: "Worktree not found" }, { status: 404 });
    }

    // Check for existing plan
    const existing = await prisma.plan.findUnique({ where: { worktreeId: id } });
    if (existing) {
      return NextResponse.json(
        { error: "A plan already exists for this worktree. Delete it first to re-import." },
        { status: 409 }
      );
    }

    // Resolve content
    let markdown: string;
    if (typeof rawContent === "string" && rawContent.trim()) {
      markdown = rawContent;
    } else {
      const filePath = path.resolve((rawFilePath as string).trim());

      // Path traversal guard: file must be inside worktree directory
      if (!filePath.startsWith(worktree.path + path.sep) && filePath !== worktree.path) {
        return NextResponse.json(
          { error: "filePath must be inside the worktree directory" },
          { status: 400 }
        );
      }

      try {
        markdown = await fs.readFile(filePath, "utf-8");
      } catch {
        return NextResponse.json(
          { error: `File not found or unreadable: ${filePath}` },
          { status: 400 }
        );
      }
    }

    const parsed = parsePlan(markdown);

    // Create plan + phases in a single transaction
    const plan = await prisma.$transaction(async (tx) => {
      const created = await tx.plan.create({
        data: {
          worktreeId: id,
          title: parsed.title,
          ...(parsed.architecturalNotes ? { architecturalNotes: parsed.architecturalNotes } : {}),
          phases: {
            create: parsed.phases.map((p) => ({
              name: p.name,
              order: p.order,
              status: p.status as PhaseStatus,
              ...(p.description ? { description: p.description } : {}),
              ...(p.acceptanceCriteria ? { acceptanceCriteria: p.acceptanceCriteria } : {}),
            })),
          },
        },
        include: {
          phases: { orderBy: { order: "asc" } },
        },
      });

      // Auto-advance stage to PLAN
      if (isBelowPlan(worktree.stage)) {
        await tx.worktree.update({
          where: { id },
          data: { stage: WorktreeStage.PLAN },
        });
      }

      return created;
    });

    return NextResponse.json(plan, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
