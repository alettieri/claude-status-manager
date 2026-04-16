"use client";

import { useState } from "react";

type Phase = {
  id: string;
  order: number;
  name: string;
  status: string;
  description: string | null;
  acceptanceCriteria: string | null;
  _count: { tasks: number };
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
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: cfg.dot,
          flexShrink: 0,
        }}
      />
      {cfg.label}
    </span>
  );
}

/**
 * Renders a single criterion line from the raw stored markdown checkbox list.
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
        const checked = /^-\s*\[x\]/i.test(line);
        const text = line.replace(/^-\s*\[[ x]\]\s*/i, "");
        return (
          <li
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              fontSize: 12,
              color: checked ? "var(--accent-done)" : "var(--text)",
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
      })}
    </ul>
  );
}

export function PhaseCard({ phase }: { phase: Phase }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = !!(phase.description || phase.acceptanceCriteria);

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
        </div>
      )}
    </div>
  );
}
