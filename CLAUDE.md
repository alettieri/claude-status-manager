# Status Manager

A local project tracking tool for managing the spec → PRD → plan → execution pipeline across multiple git worktrees. Backed by PostgreSQL, accessed via web dashboard and CLI.

## Quick Start

```bash
docker compose up -d          # start postgres
pnpm install                  # install dependencies
npx prisma migrate dev        # run migrations
pnpm link --global            # install `sm` CLI globally (symlinked, edits take effect immediately)
pnpm dev                      # start Next.js (dashboard + API on localhost:4000)
```

## Project Structure

```
status-manager/
├── app/                      # Next.js App Router (dashboard pages + API routes)
│   ├── api/                  # REST API endpoints
│   └── (dashboard)/          # Dashboard UI pages
├── cli/                      # CLI source (commander.js, compiles to `sm` binary)
├── prisma/                   # Prisma schema and migrations
├── docs/
│   ├── specs/                # Design specs
│   └── plans/                # Implementation plans
├── docker-compose.yml        # Local Postgres
└── .env                      # Environment variables (not committed)
```

## Tech Stack

- **Runtime**: Node.js / TypeScript
- **Web**: Next.js (App Router)
- **Database**: PostgreSQL 16 (Docker) + Prisma ORM
- **CLI**: commander.js → `sm` binary
- **Package manager**: pnpm

## Architecture

### Data Model

Six tables with this hierarchy:

```
Project
  └── Worktree (stage: IDEA → SPEC → PRD → PLAN → EXECUTING → DONE)
        ├── Artifact (type: SPEC | PRD — file-backed with content snapshot)
        └── Plan (DB-owned, not file-backed)
              └── Phase (PENDING → IN_PROGRESS → COMPLETED | SKIPPED)
                    └── Task (PENDING → IN_PROGRESS → COMPLETED | FAILED)
```

- **Plan** is fully stored in the database — phases, tasks, descriptions, acceptance criteria
- **Artifact** (specs/PRDs) stores a file path + read-only content snapshot
- **Worktree stage** auto-advances as artifacts/plans are created

### API

RESTful, all under `/api/`. Nested resource routes:

- `/api/projects/:id/worktrees` — worktrees scoped to project
- `/api/worktrees/:id/artifacts` — artifacts scoped to worktree
- `/api/worktrees/:id/plan` — plan scoped to worktree
- `/api/plans/:id/phases` — phases scoped to plan
- `/api/phases/:id/tasks` — tasks scoped to phase
- `/api/tasks/active` — cross-cutting query for all in-progress tasks

### CLI (`sm`)

All commands call the API over HTTP. Requires the Next.js server to be running.

```bash
sm status                     # overview of all projects
sm status <worktree>          # detailed view for one worktree
sm plan show <worktree>       # full plan from any directory
sm task next <phase-id>       # claim next pending task (agent use)
sm task complete <id>         # mark task done
```

Pass `--json` to any command for machine-readable output.

## Development Conventions

### API Routes

- Use Next.js App Router route handlers (`app/api/.../route.ts`)
- Always validate request bodies
- Return consistent JSON error responses: `{ error: string }`
- Use Prisma client for all DB access

### Database

- UUIDs for all primary keys
- Enums for status/stage fields (defined in Prisma schema)
- Timestamps: `createdAt` (auto-set), `updatedAt` (auto-updated)
- Run `npx prisma migrate dev` after schema changes

### CLI

- Entry point: `cli/index.js` with `#!/usr/bin/env node` shebang
- Registered as `sm` via the `bin` field in `package.json`
- Installed globally during development with `pnpm link --global` (symlinked — source edits take effect immediately)
- Each subcommand in its own file under `cli/commands/`
- Commands call the API via fetch — never import Prisma directly
- Plain text output by default, `--json` flag for structured output
- Exit code 0 on success, 1 on error

### Testing

- Test API routes and CLI commands against a real Postgres instance
- Use a separate test database: `status_manager_test`

## Environment Variables

```
DATABASE_URL=postgresql://sm:sm_local@localhost:5434/status_manager
SM_API_URL=http://localhost:4000
```

## Key Design Decisions

- **Plans are DB-owned**: Plans live in PostgreSQL, not on the filesystem. This means you can access a plan from any directory via `sm plan show <worktree>`.
- **Artifacts are file-referenced**: Specs and PRDs remain as markdown files in worktrees. The DB stores a path + content snapshot for API access.
- **CLI calls API**: The CLI never touches the database directly. This keeps one code path for all mutations and means the dashboard always reflects current state.
- **Atomic task claiming**: `POST /api/phases/:id/tasks/next` atomically claims the next pending task to prevent race conditions between agents.
