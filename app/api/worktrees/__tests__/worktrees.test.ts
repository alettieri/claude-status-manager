import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PrismaClient } from "@/prisma/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { GET as listWorktrees, POST as createWorktree } from "../../projects/[id]/worktrees/route";
import { GET as getWorktree, PATCH as patchWorktree, DELETE as deleteWorktree } from "../[id]/route";

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

// ---------------------------------------------------------------------------
// POST /api/projects/[id]/worktrees
// ---------------------------------------------------------------------------

describe("POST /api/projects/[id]/worktrees", () => {
  it("creates a worktree under the project", async () => {
    const project = await seedProject("wt-create-project");

    const res = await createWorktree(
      makeRequest("POST", `http://localhost/api/projects/${project.id}/worktrees`, {
        name: "feature-branch",
        path: "/tmp/feature",
        branch: "feat/new-thing",
      }),
      makeParams(project.id)
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.id).toBeTruthy();
    expect(body.name).toBe("feature-branch");
    expect(body.branch).toBe("feat/new-thing");
    expect(body.path).toBe("/tmp/feature");
    expect(body.stage).toBe("IDEA");
    expect(body.projectId).toBe(project.id);
  });

  it("trims whitespace from name, path, and branch", async () => {
    const project = await seedProject("wt-trim-project");

    const res = await createWorktree(
      makeRequest("POST", `http://localhost/api/projects/${project.id}/worktrees`, {
        name: "  spaced-wt  ",
        path: "  /tmp/spaced  ",
        branch: "  feat/spaced  ",
      }),
      makeParams(project.id)
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.name).toBe("spaced-wt");
    expect(body.path).toBe("/tmp/spaced");
    expect(body.branch).toBe("feat/spaced");
  });

  it("returns 400 when name is missing", async () => {
    const project = await seedProject("wt-missing-name");

    const res = await createWorktree(
      makeRequest("POST", `http://localhost/api/projects/${project.id}/worktrees`, {
        path: "/tmp/x",
        branch: "main",
      }),
      makeParams(project.id)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/name/i);
  });

  it("returns 400 when path is missing", async () => {
    const project = await seedProject("wt-missing-path");

    const res = await createWorktree(
      makeRequest("POST", `http://localhost/api/projects/${project.id}/worktrees`, {
        name: "no-path-wt",
        branch: "main",
      }),
      makeParams(project.id)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/path/i);
  });

  it("returns 400 when branch is missing", async () => {
    const project = await seedProject("wt-missing-branch");

    const res = await createWorktree(
      makeRequest("POST", `http://localhost/api/projects/${project.id}/worktrees`, {
        name: "no-branch-wt",
        path: "/tmp/no-branch",
      }),
      makeParams(project.id)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/branch/i);
  });

  it("returns 404 when the project does not exist", async () => {
    const res = await createWorktree(
      makeRequest("POST", "http://localhost/api/projects/ghost-id/worktrees", {
        name: "orphan-wt",
        path: "/tmp/orphan",
        branch: "main",
      }),
      makeParams("ghost-id")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 409 when a worktree with the same name already exists", async () => {
    const project = await seedProject("wt-dup-project");
    const payload = { name: "dup-wt", path: "/tmp/dup", branch: "main" };

    await createWorktree(
      makeRequest("POST", `http://localhost/api/projects/${project.id}/worktrees`, payload),
      makeParams(project.id)
    );

    const res = await createWorktree(
      makeRequest("POST", `http://localhost/api/projects/${project.id}/worktrees`, payload),
      makeParams(project.id)
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/already exists/i);
  });
});

// ---------------------------------------------------------------------------
// GET /api/projects/[id]/worktrees
// ---------------------------------------------------------------------------

describe("GET /api/projects/[id]/worktrees", () => {
  it("returns an empty array when the project has no worktrees", async () => {
    const project = await seedProject("empty-wt-project");

    const res = await listWorktrees(
      makeRequest("GET", `http://localhost/api/projects/${project.id}/worktrees`),
      makeParams(project.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });

  it("returns only worktrees belonging to the requested project", async () => {
    const projectA = await seedProject("list-project-a");
    const projectB = await seedProject("list-project-b");

    await createWorktree(
      makeRequest("POST", `http://localhost/api/projects/${projectA.id}/worktrees`, {
        name: "wt-a1",
        path: "/tmp/a1",
        branch: "feat/a1",
      }),
      makeParams(projectA.id)
    );
    await createWorktree(
      makeRequest("POST", `http://localhost/api/projects/${projectB.id}/worktrees`, {
        name: "wt-b1",
        path: "/tmp/b1",
        branch: "feat/b1",
      }),
      makeParams(projectB.id)
    );

    const res = await listWorktrees(
      makeRequest("GET", `http://localhost/api/projects/${projectA.id}/worktrees`),
      makeParams(projectA.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("wt-a1");
  });

  it("returns 404 when the project does not exist", async () => {
    const res = await listWorktrees(
      makeRequest("GET", "http://localhost/api/projects/ghost-id/worktrees"),
      makeParams("ghost-id")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// GET /api/worktrees/[id]
// ---------------------------------------------------------------------------

describe("GET /api/worktrees/[id]", () => {
  it("returns the worktree with project, artifacts, and plan", async () => {
    const project = await seedProject("wt-detail-project");
    const createRes = await createWorktree(
      makeRequest("POST", `http://localhost/api/projects/${project.id}/worktrees`, {
        name: "detail-wt",
        path: "/tmp/detail",
        branch: "feat/detail",
      }),
      makeParams(project.id)
    );
    const { id } = await createRes.json();

    const res = await getWorktree(
      makeRequest("GET", `http://localhost/api/worktrees/${id}`),
      makeParams(id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe(id);
    expect(body.project).toMatchObject({ id: project.id, name: "wt-detail-project" });
    expect(body.artifacts).toEqual([]);
    expect(body.plan).toBeNull();
  });

  it("returns 404 for a non-existent worktree id", async () => {
    const res = await getWorktree(
      makeRequest("GET", "http://localhost/api/worktrees/ghost"),
      makeParams("ghost")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/worktrees/[id]
// ---------------------------------------------------------------------------

describe("PATCH /api/worktrees/[id]", () => {
  it("updates the worktree stage", async () => {
    const project = await seedProject("stage-project");
    const createRes = await createWorktree(
      makeRequest("POST", `http://localhost/api/projects/${project.id}/worktrees`, {
        name: "stage-wt",
        path: "/tmp/stage",
        branch: "main",
      }),
      makeParams(project.id)
    );
    const { id } = await createRes.json();

    const res = await patchWorktree(
      makeRequest("PATCH", `http://localhost/api/worktrees/${id}`, { stage: "SPEC" }),
      makeParams(id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.stage).toBe("SPEC");
  });

  it("advances stage through all valid values", async () => {
    const project = await seedProject("full-stage-project");
    const createRes = await createWorktree(
      makeRequest("POST", `http://localhost/api/projects/${project.id}/worktrees`, {
        name: "full-stage-wt",
        path: "/tmp/full-stage",
        branch: "main",
      }),
      makeParams(project.id)
    );
    const { id } = await createRes.json();

    const stages = ["SPEC", "PRD", "PLAN", "EXECUTING", "DONE"] as const;
    for (const stage of stages) {
      const res = await patchWorktree(
        makeRequest("PATCH", `http://localhost/api/worktrees/${id}`, { stage }),
        makeParams(id)
      );
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.stage).toBe(stage);
    }
  });

  it("returns 400 for an invalid stage value", async () => {
    const project = await seedProject("invalid-stage-project");
    const createRes = await createWorktree(
      makeRequest("POST", `http://localhost/api/projects/${project.id}/worktrees`, {
        name: "invalid-stage-wt",
        path: "/tmp/invalid-stage",
        branch: "main",
      }),
      makeParams(project.id)
    );
    const { id } = await createRes.json();

    const res = await patchWorktree(
      makeRequest("PATCH", `http://localhost/api/worktrees/${id}`, { stage: "UNKNOWN" }),
      makeParams(id)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid stage/i);
  });

  it("updates name, path, and branch", async () => {
    const project = await seedProject("rename-project");
    const createRes = await createWorktree(
      makeRequest("POST", `http://localhost/api/projects/${project.id}/worktrees`, {
        name: "rename-wt",
        path: "/tmp/rename",
        branch: "main",
      }),
      makeParams(project.id)
    );
    const { id } = await createRes.json();

    const res = await patchWorktree(
      makeRequest("PATCH", `http://localhost/api/worktrees/${id}`, {
        name: "renamed-wt",
        path: "/tmp/renamed",
        branch: "feat/renamed",
      }),
      makeParams(id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.name).toBe("renamed-wt");
    expect(body.path).toBe("/tmp/renamed");
    expect(body.branch).toBe("feat/renamed");
  });

  it("returns 404 when patching a non-existent worktree", async () => {
    const res = await patchWorktree(
      makeRequest("PATCH", "http://localhost/api/worktrees/ghost", { stage: "SPEC" }),
      makeParams("ghost")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 400 when body is not valid JSON", async () => {
    const project = await seedProject("badjson-wt-project");
    const createRes = await createWorktree(
      makeRequest("POST", `http://localhost/api/projects/${project.id}/worktrees`, {
        name: "badjson-wt",
        path: "/tmp/badjson-wt",
        branch: "main",
      }),
      makeParams(project.id)
    );
    const { id } = await createRes.json();

    const req = new NextRequest(`http://localhost/api/worktrees/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{ not valid json",
    });

    const res = await patchWorktree(req, makeParams(id));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid json/i);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/worktrees/[id]
// ---------------------------------------------------------------------------

describe("DELETE /api/worktrees/[id]", () => {
  it("deletes the worktree and returns 204", async () => {
    const project = await seedProject("delete-wt-project");
    const createRes = await createWorktree(
      makeRequest("POST", `http://localhost/api/projects/${project.id}/worktrees`, {
        name: "delete-wt",
        path: "/tmp/delete-wt",
        branch: "main",
      }),
      makeParams(project.id)
    );
    const { id } = await createRes.json();

    const deleteRes = await deleteWorktree(
      makeRequest("DELETE", `http://localhost/api/worktrees/${id}`),
      makeParams(id)
    );

    expect(deleteRes.status).toBe(204);

    const getRes = await getWorktree(
      makeRequest("GET", `http://localhost/api/worktrees/${id}`),
      makeParams(id)
    );
    expect(getRes.status).toBe(404);
  });

  it("returns 404 when deleting a non-existent worktree", async () => {
    const res = await deleteWorktree(
      makeRequest("DELETE", "http://localhost/api/worktrees/ghost"),
      makeParams("ghost")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// Cascade delete
// ---------------------------------------------------------------------------

describe("cascade delete", () => {
  it("deleting a project removes all its worktrees", async () => {
    const project = await seedProject("cascade-project");

    await createWorktree(
      makeRequest("POST", `http://localhost/api/projects/${project.id}/worktrees`, {
        name: "cascade-wt-1",
        path: "/tmp/cascade-1",
        branch: "feat/cascade-1",
      }),
      makeParams(project.id)
    );
    await createWorktree(
      makeRequest("POST", `http://localhost/api/projects/${project.id}/worktrees`, {
        name: "cascade-wt-2",
        path: "/tmp/cascade-2",
        branch: "feat/cascade-2",
      }),
      makeParams(project.id)
    );

    // Verify worktrees exist before deletion
    const beforeRes = await listWorktrees(
      makeRequest("GET", `http://localhost/api/projects/${project.id}/worktrees`),
      makeParams(project.id)
    );
    const before = await beforeRes.json();
    expect(before).toHaveLength(2);

    // Delete the project directly via Prisma (simulating DELETE /api/projects/:id)
    await prisma.project.delete({ where: { id: project.id } });

    // The worktrees table should be empty for these IDs (cascade)
    const remaining = await prisma.worktree.findMany({
      where: { projectId: project.id },
    });
    expect(remaining).toHaveLength(0);
  });
});
