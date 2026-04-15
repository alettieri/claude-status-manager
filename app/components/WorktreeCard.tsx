"use client";

import { useState } from "react";
import Link from "next/link";
import { WorktreeStage } from "@prisma/client";

type Props = {
  id: string;
  name: string;
  branch: string;
  projectName: string;
  stage: WorktreeStage;
  stageColor: string;
};

export function WorktreeCard({ id, name, branch, projectName, stageColor }: Props) {
  const [hovered, setHovered] = useState(false);

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
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{projectName}</div>
      </div>
    </Link>
  );
}
