"use client";

import { useState } from "react";

type Criterion = {
  id: string;
  text: string;
  checked: boolean;
  order: number;
};

type Task = {
  id: string;
  order: number;
  subject: string;
  description: string | null;
  status: string;
  agentId: string | null;
  result: string | null;
  criteria: Criterion[];
};

type Phase = {
  id: string;
  order: number;
  name: string;
  status: string;
  description: string | null;
  acceptanceCriteria: string | null;
  _count: { tasks: number };
  tasks: Task[];
};

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; dot: string }
> = {
  PENDING: {
    label: "Pending",
    color: "var(--text-muted)",
    dot: "#6b7280",
  },
  IN_PROGRESS: {
    label: "In Progress",
    color: "var(--accent-executing)",
    dot: "var(--accent-executing)",
  },
  COMPLETED: {
    label: "Completed",
    color: "var(--accent-done)",
    dot: "var(--accent-done)",
  },
  SKIPPED: {
    label: "Skipped",
    color: "var(--accent-plan)",
    dot: "var(--accent-plan)",
  },
};

const TASK_STATUS_CONFIG: Record<
  string,
  { color: string; bg: string; label: string }
> = {
  PENDING: {
    color: "var(--text-muted)",
    bg: "transparent",
    label: "Pending",
  },
  IN_PROGRESS: {
    color: "var(--accent-executing)",
    bg: "transparent",
    label: "In Progress",
  },
  COMPLETED: {
    color: "var(--accent-done)",
    bg: "transparent",
    label: "Completed",
  },
  FAILED: {
    color: "#ef4444",
    bg: "transparent",
    label: "Failed",
  },
};

function StatusIndicator({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 12,
        color: cfg.color,
        fontWeight: status === "COMPLETED" ? 600 : 400,
        flexShrink: 0,
      }}
    >
      {status === "COMPLETED" ? (
        <span style={{ fontSize: 11, lineHeight: 1 }}>✓</span>
      ) : (
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: cfg.dot,
            flexShrink: 0,
          }}
        />
      )}
      {cfg.label}
    </span>
  );
}

function TaskStatusDot({ status }: { status: string }) {
  const cfg = TASK_STATUS_CONFIG[status] ?? TASK_STATUS_CONFIG.PENDING;
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: cfg.color,
        flexShrink: 0,
        display: "inline-block",
        marginTop: 1,
      }}
    />
  );
}

const CHECKED_RE = /^-\s*\[x\]/i;
const STRIP_RE = /^-\s*\[[ x]\]\s*/i;

function ChecklistItem({ text, checked }: { text: string; checked: boolean }) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        fontSize: 12,
        color: checked ? "var(--text-muted)" : "var(--text)",
        opacity: checked ? 0.65 : 1,
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          border: `1px solid ${checked ? "var(--accent-done)" : "var(--border)"}`,
          borderRadius: 3,
          background: checked ? "var(--accent-done)" : "transparent",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
        }}
      >
        {checked && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path
              d="M1 3.5L3.5 6L8 1"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span style={{ lineHeight: 1.5 }}>{text}</span>
    </li>
  );
}

/**
 * Renders a criterion list from the raw stored markdown checkbox list.
 * Supports both `- [ ] text` and `- [x] text` formats.
 */
function CriteriaList({ raw }: { raw: string }) {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <ul
      style={{
        margin: 0,
        padding: 0,
        listStyle: "none",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {lines.map((line, i) => {
        const checked = CHECKED_RE.test(line);
        const text = line.replace(STRIP_RE, "");
        return <ChecklistItem key={i} text={text} checked={checked} />;
      })}
    </ul>
  );
}

function TaskRow({ task }: { task: Task }) {
  const cfg = TASK_STATUS_CONFIG[task.status] ?? TASK_STATUS_CONFIG.PENDING;
  const isComplete = task.status === "COMPLETED";
  const isFailed = task.status === "FAILED";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "5px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Status dot */}
      <div style={{ paddingTop: 4, flexShrink: 0 }}>
        <TaskStatusDot status={task.status} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Subject line */}
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: isComplete ? "var(--text-muted)" : "var(--text)",
            textDecoration: isComplete ? "line-through" : "none",
            lineHeight: 1.4,
          }}
        >
          {task.subject}
        </div>

        {/* Agent + result row */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 2,
            flexWrap: "wrap",
          }}
        >
          {task.agentId && (
            <span
              style={{
                fontSize: 11,
                color: "var(--accent-executing)",
                fontFamily: "monospace",
              }}
            >
              @{task.agentId}
            </span>
          )}
          {task.result && (
            <span
              style={{
                fontSize: 11,
                color: isFailed ? "#ef4444" : "var(--text-muted)",
                fontStyle: "italic",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 400,
              }}
            >
              {task.result}
            </span>
          )}
        </div>

        {/* Task-level acceptance criteria — read-only checklist */}
        {task.criteria.length > 0 && (
          <ul
            style={{
              margin: "6px 0 0",
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {task.criteria.map((criterion) => (
              <ChecklistItem
                key={criterion.id}
                text={criterion.text}
                checked={criterion.checked}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Status label */}
      <span
        style={{
          fontSize: 11,
          color: cfg.color,
          flexShrink: 0,
          fontWeight: isComplete ? 600 : 400,
        }}
      >
        {cfg.label}
      </span>
    </div>
  );
}

function PhaseProgressBar({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) return null;

  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const completedPct = Math.round((completed / tasks.length) * 100);
  const inProgressPct = Math.round((inProgress / tasks.length) * 100);

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          height: 4,
          background: "var(--bg)",
          borderRadius: 2,
          overflow: "hidden",
          display: "flex",
        }}
      >
        {completedPct > 0 && (
          <div
            style={{
              width: `${completedPct}%`,
              background: "var(--accent-done)",
              transition: "width 0.3s ease",
            }}
          />
        )}
        {inProgressPct > 0 && (
          <div
            style={{
              width: `${inProgressPct}%`,
              background: "var(--accent-executing)",
              transition: "width 0.3s ease",
            }}
          />
        )}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 3,
          fontSize: 10,
          color: "var(--text-muted)",
        }}
      >
        <span>
          {completed}/{tasks.length} completed
        </span>
        {inProgress > 0 && (
          <span style={{ color: "var(--accent-executing)" }}>
            {inProgress} in progress
          </span>
        )}
      </div>
    </div>
  );
}

export function PhaseCard({ phase }: { phase: Phase }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = !!(
    phase.description ||
    phase.acceptanceCriteria ||
    phase.tasks.length > 0
  );

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        overflow: "hidden",
        marginBottom: 8,
      }}
    >
      {/* Card header — always visible, clickable when has details */}
      <button
        onClick={() => hasDetails && setExpanded((v) => !v)}
        disabled={!hasDetails}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          cursor: hasDetails ? "pointer" : "default",
          textAlign: "left",
          color: "inherit",
        }}
      >
        {/* Order badge */}
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

        {/* Phase name */}
        <span style={{ flex: 1, fontWeight: 500, fontSize: 14 }}>
          {phase.name}
        </span>

        {/* Task count */}
        <span style={{ fontSize: 12, color: "var(--text-muted)", flexShrink: 0 }}>
          {phase._count.tasks} task{phase._count.tasks !== 1 ? "s" : ""}
        </span>

        {/* Status indicator */}
        <StatusIndicator status={phase.status} />

        {/* Expand chevron */}
        {hasDetails && (
          <span
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              transform: expanded ? "rotate(180deg)" : "none",
              transition: "transform 0.15s ease",
              flexShrink: 0,
            }}
          >
            ▾
          </span>
        )}
      </button>

      {/* Expanded body */}
      {expanded && hasDetails && (
        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: "12px 14px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {/* Progress bar — shown when there are tasks */}
          {phase.tasks.length > 0 && (
            <PhaseProgressBar tasks={phase.tasks} />
          )}

          {phase.description && (
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 6,
                }}
              >
                Description
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: "var(--text)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {phase.description}
              </p>
            </div>
          )}

          {phase.acceptanceCriteria && (
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 8,
                }}
              >
                Acceptance criteria
              </div>
              <CriteriaList raw={phase.acceptanceCriteria} />
            </div>
          )}

          {/* Task list */}
          {phase.tasks.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 8,
                }}
              >
                Tasks
              </div>
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  overflow: "hidden",
                }}
              >
                {phase.tasks.map((task, idx) => (
                  <div
                    key={task.id}
                    style={{
                      padding: "6px 10px",
                      borderBottom:
                        idx < phase.tasks.length - 1
                          ? "1px solid var(--border)"
                          : "none",
                    }}
                  >
                    <TaskRow task={task} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
