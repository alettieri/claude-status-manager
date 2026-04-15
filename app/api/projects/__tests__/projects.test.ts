import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../route";
import { GET as getProject, PATCH, DELETE } from "../[id]/route";

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

// ---------------------------------------------------------------------------
// POST /api/projects
// ---------------------------------------------------------------------------

describe("POST /api/projects", () => {
  it("creates a project with name and basePath", async () => {
    const req = makeRequest("POST", "http://localhost/api/projects", {
      name: "my-project",
      basePath: "/home/user/projects",
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.id).toBeTruthy();
    expect(body.name).toBe("my-project");
    expect(body.basePath).toBe("/home/user/projects");
    expect(body.description).toBeNull();
  });

  it("creates a project with an optional description", async () => {
    const req = makeRequest("POST", "http://localhost/api/projects", {
      name: "described-project",
      basePath: "/tmp/described",
      description: "A test project",
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.description).toBe("A test project");
  });

  it("trims whitespace from name and basePath", async () => {
    const req = makeRequest("POST", "http://localhost/api/projects", {
      name: "  trimmed  ",
      basePath: "  /trimmed/path  ",
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.name).toBe("trimmed");
    expect(body.basePath).toBe("/trimmed/path");
  });

  it("returns 400 when name is missing", async () => {
    const req = makeRequest("POST", "http://localhost/api/projects", {
      basePath: "/home/user/projects",
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/name/i);
  });

  it("returns 400 when name is blank whitespace", async () => {
    const req = makeRequest("POST", "http://localhost/api/projects", {
      name: "   ",
      basePath: "/home/user/projects",
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/name/i);
  });

  it("returns 400 when basePath is missing", async () => {
    const req = makeRequest("POST", "http://localhost/api/projects", {
      name: "project-without-path",
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/basePath/i);
  });

  it("returns 400 when body is not valid JSON", async () => {
    const req = new NextRequest("http://localhost/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json {",
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid json/i);
  });

  it("returns 409 when a project with the same name already exists", async () => {
    const payload = { name: "duplicate-project", basePath: "/tmp/dup" };

    await POST(makeRequest("POST", "http://localhost/api/projects", payload));

    const res = await POST(
      makeRequest("POST", "http://localhost/api/projects", payload)
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/already exists/i);
  });
});

// ---------------------------------------------------------------------------
// GET /api/projects
// ---------------------------------------------------------------------------

describe("GET /api/projects", () => {
  it("returns an empty array when no projects exist", async () => {
    const req = makeRequest("GET", "http://localhost/api/projects");
    const res = await GET(req as NextRequest);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });

  it("returns all projects with worktree counts", async () => {
    await POST(
      makeRequest("POST", "http://localhost/api/projects", {
        name: "project-alpha",
        basePath: "/tmp/alpha",
      })
    );
    await POST(
      makeRequest("POST", "http://localhost/api/projects", {
        name: "project-beta",
        basePath: "/tmp/beta",
      })
    );

    const res = await GET(new NextRequest("http://localhost/api/projects"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0]._count).toBeDefined();
    expect(body[0]._count.worktrees).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GET /api/projects/[id]
// ---------------------------------------------------------------------------

describe("GET /api/projects/[id]", () => {
  it("returns the project with its worktrees", async () => {
    const createRes = await POST(
      makeRequest("POST", "http://localhost/api/projects", {
        name: "detail-project",
        basePath: "/tmp/detail",
      })
    );
    const { id } = await createRes.json();

    const res = await getProject(
      makeRequest("GET", `http://localhost/api/projects/${id}`),
      makeParams(id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe(id);
    expect(body.name).toBe("detail-project");
    expect(body.worktrees).toEqual([]);
  });

  it("returns 404 for a non-existent project id", async () => {
    const res = await getProject(
      makeRequest("GET", "http://localhost/api/projects/nonexistent-id"),
      makeParams("nonexistent-id")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/projects/[id]
// ---------------------------------------------------------------------------

describe("PATCH /api/projects/[id]", () => {
  it("updates the project name", async () => {
    const createRes = await POST(
      makeRequest("POST", "http://localhost/api/projects", {
        name: "patch-original",
        basePath: "/tmp/patch",
      })
    );
    const { id } = await createRes.json();

    const res = await PATCH(
      makeRequest("PATCH", `http://localhost/api/projects/${id}`, {
        name: "patch-updated",
      }),
      makeParams(id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.name).toBe("patch-updated");
  });

  it("updates the description to a new value", async () => {
    const createRes = await POST(
      makeRequest("POST", "http://localhost/api/projects", {
        name: "desc-project",
        basePath: "/tmp/desc",
        description: "original",
      })
    );
    const { id } = await createRes.json();

    const res = await PATCH(
      makeRequest("PATCH", `http://localhost/api/projects/${id}`, {
        description: "updated description",
      }),
      makeParams(id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.description).toBe("updated description");
  });

  it("clears the description when an empty string is sent", async () => {
    const createRes = await POST(
      makeRequest("POST", "http://localhost/api/projects", {
        name: "clear-desc-project",
        basePath: "/tmp/clear",
        description: "to be cleared",
      })
    );
    const { id } = await createRes.json();

    const res = await PATCH(
      makeRequest("PATCH", `http://localhost/api/projects/${id}`, {
        description: "",
      }),
      makeParams(id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.description).toBeNull();
  });

  it("returns 404 when patching a non-existent project", async () => {
    const res = await PATCH(
      makeRequest("PATCH", "http://localhost/api/projects/ghost", {
        name: "ghost-update",
      }),
      makeParams("ghost")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 400 when body is not valid JSON", async () => {
    const createRes = await POST(
      makeRequest("POST", "http://localhost/api/projects", {
        name: "badjson-project",
        basePath: "/tmp/badjson",
      })
    );
    const { id } = await createRes.json();

    const req = new NextRequest(
      `http://localhost/api/projects/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{ not valid",
      }
    );

    const res = await PATCH(req, makeParams(id));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid json/i);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/projects/[id]
// ---------------------------------------------------------------------------

describe("DELETE /api/projects/[id]", () => {
  it("deletes a project and returns 204", async () => {
    const createRes = await POST(
      makeRequest("POST", "http://localhost/api/projects", {
        name: "delete-me",
        basePath: "/tmp/delete",
      })
    );
    const { id } = await createRes.json();

    const deleteRes = await DELETE(
      makeRequest("DELETE", `http://localhost/api/projects/${id}`),
      makeParams(id)
    );

    expect(deleteRes.status).toBe(204);

    // Confirm it's gone
    const getRes = await getProject(
      makeRequest("GET", `http://localhost/api/projects/${id}`),
      makeParams(id)
    );
    expect(getRes.status).toBe(404);
  });

  it("returns 404 when deleting a non-existent project", async () => {
    const res = await DELETE(
      makeRequest("DELETE", "http://localhost/api/projects/ghost"),
      makeParams("ghost")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});
