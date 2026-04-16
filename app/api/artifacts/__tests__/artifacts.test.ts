import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { PrismaClient } from "@/prisma/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import path from "path";
import { GET as listArtifacts, POST as createArtifact } from "../../worktrees/[id]/artifacts/route";
import { GET as getArtifact, PATCH as patchArtifact, DELETE as deleteArtifact } from "../[id]/route";
import { POST as refreshArtifact } from "../[id]/refresh/route";
import { POST as syncWorktree } from "../../worktrees/[id]/sync/route";

// ---------------------------------------------------------------------------
// Shared Prisma client for seeding test data
// ---------------------------------------------------------------------------

const adapter = new PrismaPg({
  connectionString: "postgresql://sm:sm_local@localhost:5434/status_manager_test",
});
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function seedProject(name = "test-project") {
  return prisma.project.create({
    data: { name, basePath: `/tmp/${name}` },
  });
}

async function seedWorktree(projectId: string, name = "test-wt", overrides: Record<string, unknown> = {}) {
  return prisma.worktree.create({
    data: {
      projectId,
      name,
      path: `/tmp/${name}`,
      branch: "main",
      ...overrides,
    },
  });
}

async function seedArtifact(
  worktreeId: string,
  filePath: string,
  overrides: Record<string, unknown> = {}
) {
  return prisma.artifact.create({
    data: {
      worktreeId,
      type: "SPEC",
      filePath,
      title: "Test Spec",
      content: "# Test\n\nSome content",
      ...overrides,
    },
  });
}

// ---------------------------------------------------------------------------
// Temp directory management
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = `/tmp/artifact-tests-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// POST /api/worktrees/[id]/artifacts — create artifact
// ---------------------------------------------------------------------------

describe("POST /api/worktrees/[id]/artifacts", () => {
  it("creates artifact and reads file content from disk", async () => {
    const filePath = path.join(tmpDir, "my-spec.md");
    writeFileSync(filePath, "# My Spec\n\nThis is the content.");

    const project = await seedProject("create-artifact-project");
    const worktree = await seedWorktree(project.id, "create-artifact-wt", { path: tmpDir });

    const res = await createArtifact(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/artifacts`, {
        type: "SPEC",
        filePath,
      }),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.id).toBeTruthy();
    expect(body.worktreeId).toBe(worktree.id);
    expect(body.type).toBe("SPEC");
    expect(body.filePath).toBe(filePath);
    expect(body.content).toBe("# My Spec\n\nThis is the content.");
    expect(body.status).toBe("DRAFT");
    expect(body.deletedAt).toBeNull();
  });

  it("derives title from filename when no title is provided", async () => {
    const filePath = path.join(tmpDir, "my-awesome-spec.md");
    writeFileSync(filePath, "content");

    const project = await seedProject("derive-title-project");
    const worktree = await seedWorktree(project.id, "derive-title-wt", { path: tmpDir });

    const res = await createArtifact(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/artifacts`, {
        type: "SPEC",
        filePath,
      }),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    // Hyphens in filename get replaced with spaces, extension stripped
    expect(body.title).toBe("my awesome spec");
  });

  it("uses custom title when provided", async () => {
    const filePath = path.join(tmpDir, "raw-filename.md");
    writeFileSync(filePath, "content");

    const project = await seedProject("custom-title-project");
    const worktree = await seedWorktree(project.id, "custom-title-wt", { path: tmpDir });

    const res = await createArtifact(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/artifacts`, {
        type: "SPEC",
        filePath,
        title: "My Custom Title",
      }),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.title).toBe("My Custom Title");
  });

  it("returns 404 when worktree does not exist", async () => {
    const filePath = path.join(tmpDir, "spec.md");
    writeFileSync(filePath, "content");

    const res = await createArtifact(
      makeRequest("POST", "http://localhost/api/worktrees/ghost-wt/artifacts", {
        type: "SPEC",
        filePath,
      }),
      makeParams("ghost-wt")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 400 for an invalid artifact type", async () => {
    const project = await seedProject("invalid-type-project");
    const worktree = await seedWorktree(project.id, "invalid-type-wt");

    const res = await createArtifact(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/artifacts`, {
        type: "INVALID",
        filePath: "/tmp/spec.md",
      }),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/type/i);
  });

  it("returns 400 when filePath is missing", async () => {
    const project = await seedProject("missing-filepath-project");
    const worktree = await seedWorktree(project.id, "missing-filepath-wt");

    const res = await createArtifact(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/artifacts`, {
        type: "SPEC",
      }),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/filePath/i);
  });

  it("returns 400 when file does not exist on disk", async () => {
    const project = await seedProject("missing-file-project");
    const worktree = await seedWorktree(project.id, "missing-file-wt", { path: tmpDir });

    const res = await createArtifact(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/artifacts`, {
        type: "SPEC",
        filePath: path.join(tmpDir, "this-file-does-not-exist-ever.md"),
      }),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/not found or unreadable/i);
  });

  it("returns 400 when filePath is outside the worktree directory", async () => {
    const outsideFile = path.join(tmpDir, "..", "outside-file.md");
    writeFileSync(outsideFile, "secret content");

    const project = await seedProject("traversal-project");
    const worktree = await seedWorktree(project.id, "traversal-wt", { path: tmpDir });

    const res = await createArtifact(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/artifacts`, {
        type: "SPEC",
        filePath: outsideFile,
      }),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/inside the worktree/i);

    // Clean up the outside file
    rmSync(outsideFile, { force: true });
  });
});

// ---------------------------------------------------------------------------
// GET /api/worktrees/[id]/artifacts — list artifacts
// ---------------------------------------------------------------------------

describe("GET /api/worktrees/[id]/artifacts", () => {
  it("returns an empty array when worktree has no artifacts", async () => {
    const project = await seedProject("list-empty-project");
    const worktree = await seedWorktree(project.id, "list-empty-wt");

    const res = await listArtifacts(
      makeRequest("GET", `http://localhost/api/worktrees/${worktree.id}/artifacts`),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });

  it("returns only non-deleted artifacts", async () => {
    const project = await seedProject("list-filter-project");
    const worktree = await seedWorktree(project.id, "list-filter-wt");

    const filePath1 = path.join(tmpDir, "spec1.md");
    const filePath2 = path.join(tmpDir, "spec2.md");
    writeFileSync(filePath1, "content 1");
    writeFileSync(filePath2, "content 2");

    const active = await seedArtifact(worktree.id, filePath1, { title: "Active Spec" });
    await seedArtifact(worktree.id, filePath2, {
      title: "Deleted Spec",
      deletedAt: new Date(),
    });

    const res = await listArtifacts(
      makeRequest("GET", `http://localhost/api/worktrees/${worktree.id}/artifacts`),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(active.id);
    expect(body[0].title).toBe("Active Spec");
  });

  it("returns 404 when worktree does not exist", async () => {
    const res = await listArtifacts(
      makeRequest("GET", "http://localhost/api/worktrees/ghost-wt/artifacts"),
      makeParams("ghost-wt")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// GET /api/artifacts/[id] — get single artifact
// ---------------------------------------------------------------------------

describe("GET /api/artifacts/[id]", () => {
  it("returns the artifact with content", async () => {
    const project = await seedProject("get-artifact-project");
    const worktree = await seedWorktree(project.id, "get-artifact-wt");
    const filePath = path.join(tmpDir, "spec.md");
    const artifact = await seedArtifact(worktree.id, filePath, {
      content: "# Spec\n\nHello",
    });

    const res = await getArtifact(
      makeRequest("GET", `http://localhost/api/artifacts/${artifact.id}`),
      makeParams(artifact.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe(artifact.id);
    expect(body.content).toBe("# Spec\n\nHello");
    expect(body.type).toBe("SPEC");
    expect(body.deletedAt).toBeNull();
  });

  it("returns 404 for a non-existent artifact id", async () => {
    const res = await getArtifact(
      makeRequest("GET", "http://localhost/api/artifacts/ghost-artifact"),
      makeParams("ghost-artifact")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 404 for a soft-deleted artifact", async () => {
    const project = await seedProject("get-deleted-project");
    const worktree = await seedWorktree(project.id, "get-deleted-wt");
    const filePath = path.join(tmpDir, "deleted.md");
    const artifact = await seedArtifact(worktree.id, filePath, {
      deletedAt: new Date(),
    });

    const res = await getArtifact(
      makeRequest("GET", `http://localhost/api/artifacts/${artifact.id}`),
      makeParams(artifact.id)
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/artifacts/[id] — update status/title
// ---------------------------------------------------------------------------

describe("PATCH /api/artifacts/[id]", () => {
  it("updates status", async () => {
    const project = await seedProject("patch-status-project");
    const worktree = await seedWorktree(project.id, "patch-status-wt");
    const filePath = path.join(tmpDir, "spec.md");
    const artifact = await seedArtifact(worktree.id, filePath);

    const res = await patchArtifact(
      makeRequest("PATCH", `http://localhost/api/artifacts/${artifact.id}`, {
        status: "REVIEW",
      }),
      makeParams(artifact.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("REVIEW");
  });

  it("updates title", async () => {
    const project = await seedProject("patch-title-project");
    const worktree = await seedWorktree(project.id, "patch-title-wt");
    const filePath = path.join(tmpDir, "spec.md");
    const artifact = await seedArtifact(worktree.id, filePath, { title: "Old Title" });

    const res = await patchArtifact(
      makeRequest("PATCH", `http://localhost/api/artifacts/${artifact.id}`, {
        title: "New Title",
      }),
      makeParams(artifact.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.title).toBe("New Title");
  });

  it("returns 400 for an invalid status value", async () => {
    const project = await seedProject("patch-invalid-status-project");
    const worktree = await seedWorktree(project.id, "patch-invalid-status-wt");
    const filePath = path.join(tmpDir, "spec.md");
    const artifact = await seedArtifact(worktree.id, filePath);

    const res = await patchArtifact(
      makeRequest("PATCH", `http://localhost/api/artifacts/${artifact.id}`, {
        status: "PUBLISHED",
      }),
      makeParams(artifact.id)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid status/i);
  });

  it("returns 404 for a non-existent artifact", async () => {
    const res = await patchArtifact(
      makeRequest("PATCH", "http://localhost/api/artifacts/ghost-artifact", {
        status: "REVIEW",
      }),
      makeParams("ghost-artifact")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 404 for a soft-deleted artifact", async () => {
    const project = await seedProject("patch-deleted-project");
    const worktree = await seedWorktree(project.id, "patch-deleted-wt");
    const filePath = path.join(tmpDir, "spec.md");
    const artifact = await seedArtifact(worktree.id, filePath, {
      deletedAt: new Date(),
    });

    const res = await patchArtifact(
      makeRequest("PATCH", `http://localhost/api/artifacts/${artifact.id}`, {
        status: "REVIEW",
      }),
      makeParams(artifact.id)
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/artifacts/[id] — soft delete
// ---------------------------------------------------------------------------

describe("DELETE /api/artifacts/[id]", () => {
  it("soft-deletes the artifact and returns 204", async () => {
    const project = await seedProject("delete-artifact-project");
    const worktree = await seedWorktree(project.id, "delete-artifact-wt");
    const filePath = path.join(tmpDir, "spec.md");
    const artifact = await seedArtifact(worktree.id, filePath);

    const deleteRes = await deleteArtifact(
      makeRequest("DELETE", `http://localhost/api/artifacts/${artifact.id}`),
      makeParams(artifact.id)
    );

    expect(deleteRes.status).toBe(204);

    // Artifact is still in the database but with deletedAt set
    const inDb = await prisma.artifact.findUnique({ where: { id: artifact.id } });
    expect(inDb).not.toBeNull();
    expect(inDb!.deletedAt).not.toBeNull();

    // GET now returns 404
    const getRes = await getArtifact(
      makeRequest("GET", `http://localhost/api/artifacts/${artifact.id}`),
      makeParams(artifact.id)
    );
    expect(getRes.status).toBe(404);
  });

  it("returns 404 for a non-existent artifact", async () => {
    const res = await deleteArtifact(
      makeRequest("DELETE", "http://localhost/api/artifacts/ghost-artifact"),
      makeParams("ghost-artifact")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 404 when attempting to delete an already soft-deleted artifact", async () => {
    const project = await seedProject("double-delete-project");
    const worktree = await seedWorktree(project.id, "double-delete-wt");
    const filePath = path.join(tmpDir, "spec.md");
    const artifact = await seedArtifact(worktree.id, filePath, {
      deletedAt: new Date(),
    });

    const res = await deleteArtifact(
      makeRequest("DELETE", `http://localhost/api/artifacts/${artifact.id}`),
      makeParams(artifact.id)
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// POST /api/artifacts/[id]/refresh — refresh content
// ---------------------------------------------------------------------------

describe("POST /api/artifacts/[id]/refresh", () => {
  it("re-reads the file from disk and updates the content snapshot", async () => {
    const project = await seedProject("refresh-project");
    const worktree = await seedWorktree(project.id, "refresh-wt");

    const filePath = path.join(tmpDir, "spec.md");
    writeFileSync(filePath, "# Original\n\nOld content.");
    const artifact = await seedArtifact(worktree.id, filePath, {
      content: "# Original\n\nOld content.",
    });

    // Update the file on disk
    writeFileSync(filePath, "# Updated\n\nNew content.");

    const res = await refreshArtifact(
      makeRequest("POST", `http://localhost/api/artifacts/${artifact.id}/refresh`),
      makeParams(artifact.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.content).toBe("# Updated\n\nNew content.");
  });

  it("returns 404 for a non-existent artifact", async () => {
    const res = await refreshArtifact(
      makeRequest("POST", "http://localhost/api/artifacts/ghost-artifact/refresh"),
      makeParams("ghost-artifact")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 404 for a soft-deleted artifact", async () => {
    const project = await seedProject("refresh-deleted-project");
    const worktree = await seedWorktree(project.id, "refresh-deleted-wt");
    const filePath = path.join(tmpDir, "spec.md");
    writeFileSync(filePath, "content");
    const artifact = await seedArtifact(worktree.id, filePath, {
      deletedAt: new Date(),
    });

    const res = await refreshArtifact(
      makeRequest("POST", `http://localhost/api/artifacts/${artifact.id}/refresh`),
      makeParams(artifact.id)
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 400 when the file no longer exists on disk", async () => {
    const project = await seedProject("refresh-missing-file-project");
    const worktree = await seedWorktree(project.id, "refresh-missing-file-wt");

    const filePath = path.join(tmpDir, "gone.md");
    writeFileSync(filePath, "content");
    const artifact = await seedArtifact(worktree.id, filePath, { content: "content" });

    // Remove the file
    rmSync(filePath);

    const res = await refreshArtifact(
      makeRequest("POST", `http://localhost/api/artifacts/${artifact.id}/refresh`),
      makeParams(artifact.id)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/not found or unreadable/i);
  });
});

// ---------------------------------------------------------------------------
// POST /api/worktrees/[id]/sync — filesystem sync
// ---------------------------------------------------------------------------

describe("POST /api/worktrees/[id]/sync", () => {
  it("creates artifacts for discovered markdown files in docs/specs/", async () => {
    const project = await seedProject("sync-create-project");
    const wtPath = path.join(tmpDir, "sync-create-wt");
    const specsDir = path.join(wtPath, "docs", "specs");
    mkdirSync(specsDir, { recursive: true });
    writeFileSync(path.join(specsDir, "spec-one.md"), "# Spec One\n\nContent here.");
    writeFileSync(path.join(specsDir, "spec-two.md"), "# Spec Two\n\nMore content.");
    const worktree = await seedWorktree(project.id, "sync-create-wt", { path: wtPath });

    const res = await syncWorktree(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/sync`),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.created).toBe(2);
    expect(body.updated).toBe(0);
    expect(body.softDeleted).toBe(0);
    expect(body.files.created).toHaveLength(2);

    const artifacts = await prisma.artifact.findMany({ where: { worktreeId: worktree.id } });
    expect(artifacts).toHaveLength(2);
    expect(artifacts.every((a) => a.type === "SPEC")).toBe(true);
  });

  it("soft-deletes artifacts whose files no longer exist on disk", async () => {
    const project = await seedProject("sync-delete-project");
    const wtPath = path.join(tmpDir, "sync-delete-wt");
    const specsDir = path.join(wtPath, "docs", "specs");
    mkdirSync(specsDir, { recursive: true });

    // Create a file and register its artifact, then remove the file
    const gonePath = path.join(specsDir, "gone.md");
    writeFileSync(gonePath, "# Gone");
    const worktree = await seedWorktree(project.id, "sync-delete-wt", { path: wtPath });
    const artifact = await seedArtifact(worktree.id, gonePath, { title: "Gone" });

    // Remove the file so it won't be discovered
    rmSync(gonePath);

    const res = await syncWorktree(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/sync`),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.softDeleted).toBe(1);
    expect(body.files.softDeleted).toContain(gonePath);

    const inDb = await prisma.artifact.findUnique({ where: { id: artifact.id } });
    expect(inDb!.deletedAt).not.toBeNull();
  });

  it("updates content snapshot for existing artifacts whose files have changed", async () => {
    const project = await seedProject("sync-update-project");
    const wtPath = path.join(tmpDir, "sync-update-wt");
    const specsDir = path.join(wtPath, "docs", "specs");
    mkdirSync(specsDir, { recursive: true });

    const filePath = path.join(specsDir, "existing.md");
    writeFileSync(filePath, "# Updated\n\nNew content.");
    const worktree = await seedWorktree(project.id, "sync-update-wt", { path: wtPath });
    // Seed artifact with old content at the same path
    await seedArtifact(worktree.id, filePath, { content: "# Old\n\nOld content." });

    const res = await syncWorktree(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/sync`),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.updated).toBe(1);
    expect(body.created).toBe(0);

    const artifacts = await prisma.artifact.findMany({
      where: { worktreeId: worktree.id, deletedAt: null },
    });
    expect(artifacts[0].content).toBe("# Updated\n\nNew content.");
  });

  it("auto-advances stage from IDEA to SPEC when spec files are found", async () => {
    const project = await seedProject("sync-stage-spec-project");
    const wtPath = path.join(tmpDir, "sync-stage-spec-wt");
    const specsDir = path.join(wtPath, "docs", "specs");
    mkdirSync(specsDir, { recursive: true });
    writeFileSync(path.join(specsDir, "spec.md"), "# Spec");
    const worktree = await seedWorktree(project.id, "sync-stage-spec-wt", {
      path: wtPath,
      stage: "IDEA",
    });

    const res = await syncWorktree(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/sync`),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.stageAdvanced).toBe("SPEC");

    const updated = await prisma.worktree.findUnique({ where: { id: worktree.id } });
    expect(updated!.stage).toBe("SPEC");
  });

  it("auto-advances stage from SPEC to PRD when prd files are found", async () => {
    const project = await seedProject("sync-stage-prd-project");
    const wtPath = path.join(tmpDir, "sync-stage-prd-wt");
    const prdDir = path.join(wtPath, "docs", "prd");
    mkdirSync(prdDir, { recursive: true });
    writeFileSync(path.join(prdDir, "prd.md"), "# PRD");
    const worktree = await seedWorktree(project.id, "sync-stage-prd-wt", {
      path: wtPath,
      stage: "SPEC",
    });

    const res = await syncWorktree(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/sync`),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.stageAdvanced).toBe("PRD");

    const updated = await prisma.worktree.findUnique({ where: { id: worktree.id } });
    expect(updated!.stage).toBe("PRD");
  });

  it("does not revert stage to SPEC when worktree is already at PLAN and only specs are found", async () => {
    const project = await seedProject("sync-no-revert-project");
    const wtPath = path.join(tmpDir, "sync-no-revert-wt");
    const specsDir = path.join(wtPath, "docs", "specs");
    mkdirSync(specsDir, { recursive: true });
    writeFileSync(path.join(specsDir, "spec.md"), "# Spec");
    const worktree = await seedWorktree(project.id, "sync-no-revert-wt", {
      path: wtPath,
      stage: "PLAN",
    });

    const res = await syncWorktree(
      makeRequest("POST", `http://localhost/api/worktrees/${worktree.id}/sync`),
      makeParams(worktree.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.stageAdvanced).toBeNull();

    const updated = await prisma.worktree.findUnique({ where: { id: worktree.id } });
    expect(updated!.stage).toBe("PLAN");
  });

  it("returns 404 when worktree does not exist", async () => {
    const res = await syncWorktree(
      makeRequest("POST", "http://localhost/api/worktrees/ghost-wt/sync"),
      makeParams("ghost-wt")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});
