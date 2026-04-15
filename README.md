# Status Manager

Track the lifecycle of project work across git worktrees — from spec to PRD to plan to execution.

## What It Does

If you work on a project with multiple feature slices in separate git worktrees, Status Manager gives you:

- A **Kanban dashboard** showing where every worktree is in the pipeline (Spec → PRD → Plan → Executing → Done)
- A **CLI (`sm`)** for quick status checks and for agents to report progress
- **Centralized plans** stored in a database, accessible from any directory
- **Filesystem sync** that discovers existing specs and PRDs in your worktrees

## Prerequisites

- Node.js 18+
- Docker (for local Postgres)
- pnpm

## Setup

```bash
# Clone and install
pnpm install

# Start Postgres
docker compose up -d

# Install dependencies and run migrations
pnpm install
npx prisma migrate dev

# Install the `sm` CLI globally (symlinked to source — edits take effect immediately)
pnpm link --global

# Start the app (dashboard + API)
pnpm dev
```

Open http://localhost:3000 for the dashboard.

## Usage

### Register a project and worktrees

```bash
sm project add productiv --path /Users/you/projects/productiv/main
sm worktree add auth-system --project productiv --path /Users/you/projects/productiv/auth --branch feature/auth
sm worktree add dashboard --project productiv --path /Users/you/projects/productiv/dashboard --branch feature/dashboard
```

### Sync existing docs

```bash
sm worktree sync auth-system    # discovers specs/PRDs in the worktree
```

### Manage plans

```bash
sm plan create auth-system --title "Auth System Implementation"
sm plan import auth-system --file docs/plans/auth-system.md   # parse markdown into DB
sm plan show auth-system         # view full plan from anywhere
```

### Agent workflow

```bash
sm task next <phase-id> --agent my-agent     # claim next pending task
sm task complete <task-id> --result "done"    # report success
sm task fail <task-id> --reason "blocked"     # report failure
```

### Quick status

```bash
sm status                  # all projects overview
sm status auth-system      # detailed view for one worktree
```

## Documentation

- [Design Spec](docs/specs/2026-04-14-status-manager-design.md) — full system design
- [Implementation Plan](docs/plans/status-manager.md) — phased build plan
- [CLAUDE.md](CLAUDE.md) — developer/agent reference
