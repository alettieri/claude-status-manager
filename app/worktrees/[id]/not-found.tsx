import Link from "next/link";

export default function WorktreeNotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 600 }}>Worktree not found</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
        This worktree may have been removed.
      </p>
      <Link href="/" style={{ fontSize: 13 }}>
        Back to dashboard
      </Link>
    </div>
  );
}
