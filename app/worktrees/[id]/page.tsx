import { notFound } from "next/navigation";
import Link from "next/link";
import { getWorktreeDetail } from "@/lib/services/worktrees";
import { STAGE_LABELS, STAGE_COLORS } from "@/lib/stages";

export const revalidate = 0;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function WorktreeDetailPage({ params, searchParams }: Props) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);

  const worktree = await getWorktreeDetail(id);
  if (!worktree) notFound();

  const stageColor = STAGE_COLORS[worktree.stage];

  const activeArtifacts = worktree.artifacts;
  const specs = activeArtifacts.filter((a) => a.type === "SPEC");
  const prds = activeArtifacts.filter((a) => a.type === "PRD");

  // Determine which top-level tab is active: artifacts | plan
  const hasArtifacts = activeArtifacts.length > 0;
  const activeTab = tab ?? (hasArtifacts ? "artifacts" : "plan");

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
        <Link href="/" style={{ color: "var(--text-muted)", fontSize: 13 }}>
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
              style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace" }}
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

        {/* Tab navigation */}
        <div
          style={{
            display: "flex",
            gap: 0,
            borderBottom: "1px solid var(--border)",
            marginBottom: 24,
          }}
        >
          <TabLink
            href={`/worktrees/${id}?tab=artifacts`}
            active={activeTab === "artifacts"}
            label={`Artifacts${activeArtifacts.length > 0 ? ` (${activeArtifacts.length})` : ""}`}
          />
          <TabLink
            href={`/worktrees/${id}?tab=spec`}
            active={activeTab === "spec"}
            label={`Spec${specs.length > 0 ? ` (${specs.length})` : ""}`}
          />
          <TabLink
            href={`/worktrees/${id}?tab=prd`}
            active={activeTab === "prd"}
            label={`PRD${prds.length > 0 ? ` (${prds.length})` : ""}`}
          />
          <TabLink
            href={`/worktrees/${id}?tab=plan`}
            active={activeTab === "plan"}
            label="Plan"
          />
        </div>

        {/* Artifacts tab — overview list */}
        {activeTab === "artifacts" && (
          <section>
            {activeArtifacts.length === 0 ? (
              <EmptyHint>
                No artifacts registered. Use{" "}
                <code style={{ fontFamily: "monospace" }}>
                  sm artifact add {worktree.name} --type spec --file &lt;path&gt;
                </code>{" "}
                or{" "}
                <code style={{ fontFamily: "monospace" }}>
                  sm worktree sync {worktree.name}
                </code>
              </EmptyHint>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {activeArtifacts.map((artifact) => (
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
                    <TypeBadge type={artifact.type} />
                    <span style={{ fontWeight: 500, flex: 1 }}>{artifact.title}</span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        fontFamily: "monospace",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 280,
                      }}
                    >
                      {artifact.filePath}
                    </span>
                    <StatusBadge status={artifact.status} />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Spec tab */}
        {activeTab === "spec" && (
          <section>
            {specs.length === 0 ? (
              <EmptyHint>
                No spec files found. Run{" "}
                <code style={{ fontFamily: "monospace" }}>
                  sm worktree sync {worktree.name}
                </code>{" "}
                to discover specs in{" "}
                <code style={{ fontFamily: "monospace" }}>docs/specs/</code>.
              </EmptyHint>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {specs.map((artifact) => (
                  <ArtifactDocument key={artifact.id} artifact={artifact} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* PRD tab */}
        {activeTab === "prd" && (
          <section>
            {prds.length === 0 ? (
              <EmptyHint>
                No PRD files found. Run{" "}
                <code style={{ fontFamily: "monospace" }}>
                  sm worktree sync {worktree.name}
                </code>{" "}
                to discover PRDs in{" "}
                <code style={{ fontFamily: "monospace" }}>docs/prd/</code>.
              </EmptyHint>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {prds.map((artifact) => (
                  <ArtifactDocument key={artifact.id} artifact={artifact} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Plan tab */}
        {activeTab === "plan" && (
          <section>
            {!worktree.plan ? (
              <EmptyHint>
                No plan yet. Use{" "}
                <code style={{ fontFamily: "monospace" }}>
                  sm plan create {worktree.name} --title &lt;title&gt;
                </code>
              </EmptyHint>
            ) : (
              <div>
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15 }}>
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
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {phase.status}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {phase._count.tasks} task{phase._count.tasks !== 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function TabLink({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      style={{
        padding: "8px 16px",
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: active ? "var(--text)" : "var(--text-muted)",
        borderBottom: active ? "2px solid var(--text)" : "2px solid transparent",
        textDecoration: "none",
        marginBottom: -1,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </Link>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
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
        flexShrink: 0,
      }}
    >
      {type}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "APPROVED"
      ? "var(--accent-done)"
      : status === "REVIEW"
      ? "var(--accent-plan)"
      : "var(--text-muted)";
  return (
    <span style={{ fontSize: 12, color, flexShrink: 0, fontWeight: status === "APPROVED" ? 600 : 400 }}>
      {status}
    </span>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{children}</p>
  );
}

function ArtifactDocument({
  artifact,
}: {
  artifact: {
    id: string;
    title: string;
    type: string;
    status: string;
    filePath: string;
    content: string | null;
  };
}) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        overflow: "hidden",
      }}
    >
      {/* Document header */}
      <div
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <TypeBadge type={artifact.type} />
        <span style={{ fontWeight: 600, flex: 1 }}>{artifact.title}</span>
        <StatusBadge status={artifact.status} />
      </div>
      {/* Document body */}
      {artifact.content ? (
        <pre
          style={{
            margin: 0,
            padding: "16px",
            fontFamily: "monospace",
            fontSize: 12,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflowX: "auto",
            color: "var(--text)",
            maxHeight: 600,
            overflowY: "auto",
          }}
        >
          {artifact.content}
        </pre>
      ) : (
        <p
          style={{
            margin: 0,
            padding: 16,
            fontSize: 13,
            color: "var(--text-muted)",
          }}
        >
          No content snapshot. Run{" "}
          <code style={{ fontFamily: "monospace" }}>
            sm artifact refresh {artifact.id}
          </code>
        </p>
      )}
      {/* Footer with file path */}
      <div
        style={{
          padding: "6px 16px",
          borderTop: "1px solid var(--border)",
          fontSize: 11,
          color: "var(--text-muted)",
          fontFamily: "monospace",
        }}
      >
        {artifact.filePath}
      </div>
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
      <div
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          marginBottom: 4,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
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
