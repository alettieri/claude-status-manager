import { notFound } from "next/navigation";
import Link from "next/link";
import { getWorktreeDetail } from "@/lib/services/worktrees";
import { STAGE_LABELS, STAGE_COLORS } from "@/lib/stages";

export const revalidate = 0;

type Props = { params: Promise<{ id: string }> };

export default async function WorktreeDetailPage({ params }: Props) {
  const { id } = await params;

  const worktree = await getWorktreeDetail(id);
  if (!worktree) notFound();

  const stageColor = STAGE_COLORS[worktree.stage];

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Link
          href="/"
          style={{ color: "var(--text-muted)", fontSize: 13 }}
        >
          Status Manager
        </Link>
        <span style={{ color: "var(--border)" }}>/</span>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {worktree.project.name}
        </span>
        <span style={{ color: "var(--border)" }}>/</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{worktree.name}</span>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
        {/* Title row */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
              {worktree.name}
            </h1>
            <code
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                fontFamily: "monospace",
              }}
            >
              {worktree.branch}
            </code>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "var(--bg-card)",
              border: `1px solid ${stageColor}`,
              borderRadius: 20,
              padding: "4px 12px",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: stageColor,
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: stageColor }}>
              {STAGE_LABELS[worktree.stage]}
            </span>
          </div>
        </div>

        {/* Info cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 32,
          }}
        >
          <InfoCard label="Project" value={worktree.project.name} />
          <InfoCard label="Branch" value={worktree.branch} mono />
          <InfoCard label="Path" value={worktree.path} mono />
          <InfoCard
            label="Created"
            value={new Date(worktree.createdAt).toLocaleString()}
          />
        </div>

        {/* Artifacts section */}
        <section style={{ marginBottom: 32 }}>
          <h2
            style={{
              fontSize: 15,
              fontWeight: 600,
              marginBottom: 12,
              paddingBottom: 8,
              borderBottom: "1px solid var(--border)",
            }}
          >
            Artifacts
          </h2>
          {worktree.artifacts.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              No artifacts registered. Use{" "}
              <code style={{ fontFamily: "monospace" }}>
                sm artifact add {worktree.name} --type spec --file &lt;path&gt;
              </code>
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {worktree.artifacts.map((artifact) => (
                <div
                  key={artifact.id}
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      padding: "2px 6px",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {artifact.type}
                  </span>
                  <span style={{ fontWeight: 500, flex: 1 }}>{artifact.title}</span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {artifact.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Plan section */}
        <section>
          <h2
            style={{
              fontSize: 15,
              fontWeight: 600,
              marginBottom: 12,
              paddingBottom: 8,
              borderBottom: "1px solid var(--border)",
            }}
          >
            Plan
          </h2>
          {!worktree.plan ? (
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              No plan yet. Use{" "}
              <code style={{ fontFamily: "monospace" }}>
                sm plan create {worktree.name} --title &lt;title&gt;
              </code>
            </p>
          ) : (
            <div>
              <div
                style={{
                  fontWeight: 600,
                  marginBottom: 8,
                  fontSize: 15,
                }}
              >
                {worktree.plan.title}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 12 }}>
                Status: {worktree.plan.status} &middot;{" "}
                {worktree.plan.phases.length} phase
                {worktree.plan.phases.length !== 1 ? "s" : ""}
              </div>
              {worktree.plan.phases.map((phase) => (
                <div
                  key={phase.id}
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: "10px 14px",
                    marginBottom: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      flexShrink: 0,
                    }}
                  >
                    {phase.order}
                  </span>
                  <span style={{ flex: 1, fontWeight: 500 }}>{phase.name}</span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                    }}
                  >
                    {phase.status}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                    }}
                  >
                    {phase._count.tasks} task{phase._count.tasks !== 1 ? "s" : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function InfoCard({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "10px 14px",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          fontFamily: mono ? "monospace" : undefined,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}
