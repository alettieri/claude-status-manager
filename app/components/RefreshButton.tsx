"use client";

import { useRouter } from "next/navigation";

export function RefreshButton() {
  const router = useRouter();

  return (
    <button
      onClick={() => router.refresh()}
      style={{
        background: "transparent",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        color: "var(--text-muted)",
        padding: "4px 12px",
        fontSize: 13,
      }}
    >
      Refresh
    </button>
  );
}
