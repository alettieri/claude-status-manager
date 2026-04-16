"use client";

import { useState } from "react";
import Link from "next/link";
import { WorktreeStage } from "@/prisma/generated/prisma/client";

type TaskSummary = {
  total: number;
  completed: number;
  inProgress: number;
};

type Props = {
  id: string;
  name: string;
  branch: string;
  projectName: string;
  stage: WorktreeStage;
  stageColor: string;
  taskSummary?: TaskSummary;
};

export function WorktreeCard({
  id,
  name,
  branch,
  projectName,
  stageColor,
  taskSummary,
}: Props) {
  const [hovered, setHovered] = useState(false);

  const showProgress =
    taskSummary !== undefined && taskSummary.total > 0;
  const completedPct = showProgress
    ? Math.round((taskSummary.completed / taskSummary.total) * 100)
    : 0;
  const inProgressPct = showProgress
    ? Math.round((taskSummary.inProgress / taskSummary.total) * 100)
    : 0;

  return (
    <Link href={`/worktrees/${id}`} style={{ textDecoration: "none" }}>
      <div
        style={{
          background: hovered ? "var(--bg-hover)" : "var(--bg-card)",
          border: `1px solid ${hovered ? stageColor : "var(--border)"}`,
          borderRadius: "var(--radius)",
          padding: "10px 12px",
          cursor: "pointer",
          transition: "border-color 0.15s, background 0.15s",
          overflow: "hidden",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          style={{
            fontWeight: 600,
            fontSize: 13,
            marginBottom: 4,
            color: "var(--text)",
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            fontFamily: "monospace",
            marginBottom: 6,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {branch}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            marginBottom: showProgress ? 8 : 0,
          }}
        >
          {projectName}
        </div>

        {/* Progress bar — only rendered when task data is available */}
        {showProgress && (
          <div>
            {/* Bar */}
            <div
              style={{
                height: 4,
                background: "var(--bg)",
                borderRadius: 2,
                overflow: "hidden",
                display: "flex",
              }}
            >
              {/* Completed segment */}
              {completedPct > 0 && (
                <div
                  style={{
                    width: `${completedPct}%`,
                    background: "var(--accent-done)",
                    transition: "width 0.3s ease",
                  }}
                />
              )}
              {/* In-progress segment */}
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
            {/* Label */}
            <div
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                marginTop: 3,
                textAlign: "right",
              }}
            >
              {taskSummary.completed}/{taskSummary.total} tasks
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
