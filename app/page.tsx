import { getAllProjects } from "@/lib/services/projects";
import { getAllWorktreesWithProject } from "@/lib/services/worktrees";
import { STAGES, STAGE_LABELS, STAGE_COLORS } from "@/lib/stages";
import { WorktreeStage } from "@prisma/client";
import { RefreshButton } from "./components/RefreshButton";
import { WorktreeCard } from "./components/WorktreeCard";

export const revalidate = 0;

export default async function DashboardPage() {
  const [projects, worktrees] = await Promise.all([
    getAllProjects(),
    getAllWorktreesWithProject(),
  ]);

  const byStage = Object.fromEntries(
    STAGES.map((s) => [s, worktrees.filter((w) => w.stage === s)])
  ) as Record<WorktreeStage, typeof worktrees>;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>Status Manager</span>
          <span
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 20,
              padding: "2px 8px",
            }}
          >
            {projects.length} project{projects.length !== 1 ? "s" : ""} &middot;{" "}
            {worktrees.length} worktree{worktrees.length !== 1 ? "s" : ""}
          </span>
        </div>
        <RefreshButton />
      </header>

      {/* Kanban board */}
      <main
        style={{
          flex: 1,
          padding: 24,
          overflowX: "auto",
        }}
      >
        {worktrees.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: "var(--text-muted)",
              marginTop: 80,
              fontSize: 15,
            }}
          >
            <p style={{ marginBottom: 8 }}>No worktrees registered yet.</p>
            <p>
              Run{" "}
              <code
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  padding: "2px 6px",
                  fontFamily: "monospace",
                }}
              >
                sm project add &lt;name&gt; --path &lt;path&gt;
              </code>{" "}
              to get started.
            </p>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${STAGES.length}, minmax(200px, 1fr))`,
            gap: 12,
            minWidth: 1200,
          }}
        >
          {STAGES.map((stage) => (
            <div key={stage} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Column header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 0",
                  borderBottom: `2px solid ${STAGE_COLORS[stage]}`,
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: STAGE_COLORS[stage],
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontWeight: 600, fontSize: 13 }}>{STAGE_LABELS[stage]}</span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 12,
                    color: "var(--text-muted)",
                    background: "var(--bg-card)",
                    borderRadius: 10,
                    padding: "1px 6px",
                    border: "1px solid var(--border)",
                  }}
                >
                  {byStage[stage].length}
                </span>
              </div>

              {/* Cards */}
              {byStage[stage].map((worktree) => (
                <WorktreeCard
                  key={worktree.id}
                  id={worktree.id}
                  name={worktree.name}
                  branch={worktree.branch}
                  projectName={worktree.project.name}
                  stage={stage}
                  stageColor={STAGE_COLORS[stage]}
                />
              ))}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
