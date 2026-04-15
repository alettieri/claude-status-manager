import { NextRequest, NextResponse } from "next/server";
import { ArtifactType, WorktreeStage } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { handlePrismaError } from "@/lib/prisma-errors";

type Params = { params: Promise<{ id: string }> };

// Directories to scan relative to the worktree path, and which artifact type they map to
const SCAN_DIRS: { dir: string; type: ArtifactType }[] = [
  { dir: "docs/specs", type: "SPEC" },
  { dir: "docs/superpowers/specs", type: "SPEC" },
  { dir: "docs/prd", type: "PRD" },
];

// Stage ordering for "only advance, never go backwards"
const STAGE_ORDER: WorktreeStage[] = [
  "IDEA",
  "SPEC",
  "PRD",
  "PLAN",
  "EXECUTING",
  "DONE",
];

function stageIndex(stage: WorktreeStage): number {
  return STAGE_ORDER.indexOf(stage);
}

interface DiscoveredFile {
  filePath: string;
  type: ArtifactType;
  title: string;
  content: string;
}

async function scanDirectory(
  basePath: string,
  relDir: string,
  type: ArtifactType
): Promise<DiscoveredFile[]> {
  const absDir = path.join(basePath, relDir);

  let entries: string[];
  try {
    entries = await fs.readdir(absDir);
  } catch {
    // Directory doesn't exist — skip silently
    return [];
  }

  const results: DiscoveredFile[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".md") && !entry.endsWith(".markdown")) continue;

    const filePath = path.join(absDir, entry);
    let content: string;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch {
      continue;
    }

    // Extract title from first H1 heading, fall back to filename
    const h1Match = content.match(/^#\s+(.+)$/m);
    const title = h1Match
      ? h1Match[1].trim()
      : path.basename(entry, path.extname(entry)).replace(/[-_]/g, " ");

    results.push({ filePath, type, title, content });
  }

  return results;
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const worktree = await prisma.worktree.findUnique({ where: { id } });
    if (!worktree) {
      return NextResponse.json({ error: "Worktree not found" }, { status: 404 });
    }

    // Discover all markdown files across all scan dirs
    const discovered: DiscoveredFile[] = [];
    for (const { dir, type } of SCAN_DIRS) {
      const files = await scanDirectory(worktree.path, dir, type);
      discovered.push(...files);
    }

    const discoveredPaths = new Set(discovered.map((f) => f.filePath));

    // Fetch existing non-deleted artifacts for this worktree
    const existingArtifacts = await prisma.artifact.findMany({
      where: { worktreeId: id, deletedAt: null },
    });

    const existingByPath = new Map(existingArtifacts.map((a) => [a.filePath, a]));

    const toCreate = discovered.filter((f) => !existingByPath.has(f.filePath));
    const toUpdate = discovered.filter((f) => existingByPath.has(f.filePath));
    const toSoftDelete = existingArtifacts.filter((a) => !discoveredPaths.has(a.filePath));

    // Auto-advance worktree stage based on discovered artifact types
    const hasSpec = discovered.some((f) => f.type === "SPEC");
    const hasPrd = discovered.some((f) => f.type === "PRD");

    let targetStage: WorktreeStage = worktree.stage;
    if (hasPrd && stageIndex("PRD") > stageIndex(worktree.stage)) {
      targetStage = "PRD";
    } else if (hasSpec && stageIndex("SPEC") > stageIndex(worktree.stage)) {
      targetStage = "SPEC";
    }

    await prisma.$transaction([
      prisma.artifact.createMany({
        data: toCreate.map((f) => ({
          worktreeId: id,
          type: f.type,
          filePath: f.filePath,
          title: f.title,
          content: f.content,
        })),
        skipDuplicates: true,
      }),
      ...toUpdate.map((f) => {
        const existing = existingByPath.get(f.filePath)!;
        return prisma.artifact.update({
          where: { id: existing.id },
          data: { content: f.content, title: f.title },
        });
      }),
      ...toSoftDelete.map((a) =>
        prisma.artifact.update({
          where: { id: a.id },
          data: { deletedAt: new Date() },
        })
      ),
      ...(targetStage !== worktree.stage
        ? [prisma.worktree.update({ where: { id }, data: { stage: targetStage } })]
        : []),
    ]);

    const created = toCreate.map((f) => f.filePath);
    const updated = toUpdate.map((f) => f.filePath);
    const softDeleted = toSoftDelete.map((a) => a.filePath);

    return NextResponse.json({
      created: created.length,
      updated: updated.length,
      softDeleted: softDeleted.length,
      stageAdvanced: targetStage !== worktree.stage ? targetStage : null,
      files: {
        created,
        updated,
        softDeleted,
      },
    });
  } catch (err) {
    const prismaErr = handlePrismaError(err);
    if (prismaErr) return prismaErr;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
