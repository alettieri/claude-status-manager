import { NextRequest, NextResponse } from "next/server";
import { findWorktreeByName } from "@/lib/services/worktrees";

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");

  if (!name || !name.trim()) {
    return NextResponse.json(
      { error: "Query parameter 'name' is required" },
      { status: 400 }
    );
  }

  try {
    const worktree = await findWorktreeByName(name.trim());
    if (!worktree) {
      return NextResponse.json({ error: "Worktree not found" }, { status: 404 });
    }
    return NextResponse.json(worktree);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
