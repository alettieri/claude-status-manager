# Plan: Status Manager

> Source PRD: docs/specs/2026-04-14-status-manager-design.md

## Architectural decisions

Durable decisions that apply across all phases:

- **Routes**: All API under `/api/` — nested resource routes (`/api/projects/:id/worktrees`, `/api/worktrees/:id/artifacts`, `/api/plans/:id/phases`, `/api/phases/:id/tasks`). Direct routes for cross-cutting queries (`/api/tasks/active`).
- **Schema**: 6 tables — Project, Worktree, Artifact, Plan, Phase, Task. UUIDs for primary keys. Enums for stage/status fields. Plan is DB-owned; Artifact stores file path + optional content snapshot.
- **Key models**: Plan → Phase → Task is the execution hierarchy. Artifact (SPEC, PRD) is the document reference layer. Worktree ties everything to a git worktree with a pipeline stage.
- **CLI**: `sm` binary via commander.js. All commands call the local API over HTTP at `SM_API_URL` (default `http://localhost:3000`). Plain text output by default, `--json` flag for machine-readable output.
- **Infrastructure**: PostgreSQL 16 via Docker Compose. Prisma ORM with UUID PKs. Next.js App Router for dashboard + API routes. pnpm as package manager.
- **Dashboard**: React SPA via Next.js App Router. Kanban pipeline view as main page. Worktree detail view with artifact/plan tabs. Polling or auto-refresh for real-time agent progress.

---

## Phase 1: Infrastructure + Project/Worktree CRUD
**Status**: pending

**User stories**: As a user, I can register projects and worktrees so the system knows what I'm tracking. I can see all my worktrees organized by pipeline stage in a dashboard.

### What to build

A thin vertical slice that stands up the entire stack end-to-end. Docker Compose for Postgres, Prisma schema with Project and Worktree models (including stage enum), Next.js app with API routes for Project and Worktree CRUD, the `sm` CLI binary with `project` and `worktree` subcommands, and a dashboard shell showing a Kanban board with worktrees in their stage columns. The Kanban board should show cards for each worktree with name, branch, and current stage. Clicking a card navigates to a detail page (which will be fleshed out in later phases — for now it can show basic worktree info).

### Acceptance criteria

- [ ] `docker compose up -d` starts Postgres, `npx prisma migrate dev` creates tables
- [ ] `sm project add <name> --path <path>` creates a project; `sm project list` shows it
- [ ] `sm worktree add <name> --project <project> --path <path> --branch <branch>` registers a worktree
- [ ] `sm worktree list` shows all worktrees with their stage
- [ ] `sm worktree stage <name> <stage>` updates the pipeline stage
- [ ] `sm status` shows a summary of all projects and worktrees
- [ ] Dashboard at `localhost:3000` shows Kanban columns (IDEA, SPEC, PRD, PLAN, EXECUTING, DONE) with worktree cards in the correct column
- [ ] Clicking a worktree card navigates to a detail page showing worktree info
- [ ] All API routes return proper error responses for missing/invalid resources

---

## Phase 2: Artifact Registration + Filesystem Sync
**Status**: pending

**User stories**: As a user, I can register specs and PRDs so agents can access their content without filesystem access. I can sync a worktree to auto-discover existing docs. I can view spec and PRD content in the dashboard.

### What to build

Add the Artifact model (SPEC, PRD types) to the Prisma schema. API routes for artifact CRUD including content snapshot ingestion — when an artifact is registered, the server reads the file and stores the content in the DB. Add the filesystem sync endpoint that scans `docs/specs/`, `docs/superpowers/specs/`, and `docs/prd/` in a worktree's directory, discovers markdown files, and creates/updates artifact records. CLI commands: `sm artifact add`, `sm artifact list`, `sm artifact refresh`, `sm worktree sync`. On the dashboard, add Spec and PRD tabs to the worktree detail view that render the stored markdown content. Worktree stage should auto-advance based on highest artifact type present after sync.

### Acceptance criteria

- [ ] `sm artifact add <worktree> --type spec --file <path>` registers an artifact and ingests file content
- [ ] `sm artifact list <worktree>` shows registered artifacts with type and status
- [ ] `sm artifact status <id> approved` updates artifact status
- [ ] `sm artifact refresh <id>` re-reads the file and updates the content snapshot
- [ ] `sm worktree sync <name>` scans the worktree directory and discovers spec/PRD files
- [ ] Sync creates new artifact records for discovered files and soft-deletes removed ones
- [ ] Sync auto-advances worktree stage (e.g., spec found → stage becomes SPEC)
- [ ] GET `/api/artifacts/:id` returns artifact with content snapshot
- [ ] Dashboard worktree detail shows Spec and PRD tabs with rendered markdown content
- [ ] Syncing a real worktree (e.g., ai-visibility) discovers existing spec files

---

## Phase 3: Plan + Phase Management
**Status**: pending

**User stories**: As a user, I can create and manage plans in the database, accessible from any directory. I can import existing markdown plans into the DB. I can view plan phases and their status in the dashboard.

### What to build

Add Plan and Phase models to the Prisma schema. Plan is DB-owned with title, description, architecturalNotes, and status. Phase has name, description, order, status, and acceptanceCriteria. API routes for plan CRUD, phase CRUD, plan import (parse markdown plan file into Plan + Phase records), and plan export (render DB plan as markdown). CLI commands: `sm plan create`, `sm plan show`, `sm plan import`, `sm plan export`, `sm phase add`, `sm phase list`, `sm phase update`. The markdown parser for import should handle the format produced by `/prd-to-plan` — extracting phase titles, descriptions ("What to build" sections), acceptance criteria (checkbox lists), and status fields. On the dashboard, add a Plan tab to the worktree detail view showing phases with status indicators, descriptions, and acceptance criteria. Phase status should be updatable from the dashboard.

### Acceptance criteria

- [ ] `sm plan create <worktree> --title <title>` creates an empty plan in the DB
- [ ] `sm plan import <worktree> --file <path>` parses a markdown plan and creates Plan + Phase records
- [ ] Imported phases have correct name, description, order, acceptance criteria, and status
- [ ] `sm plan show <worktree>` displays the full plan with phases from any directory
- [ ] `sm plan export <worktree>` renders the DB plan as markdown matching the original format
- [ ] `sm phase update <id> --status completed` updates a phase's status
- [ ] `sm phase list <plan-id>` shows all phases with status
- [ ] Dashboard Plan tab shows phases with status indicators (pending/in_progress/completed/skipped)
- [ ] Phase cards are expandable to show description and acceptance criteria
- [ ] Creating a plan auto-advances worktree stage to PLAN

---

## Phase 4: Task Execution Layer
**Status**: pending

**User stories**: As an agent, I can claim the next available task, report completion or failure, and see what's assigned to me. As a user, I can see real-time task progress with agent assignments in the dashboard.

### What to build

Add the Task model to the Prisma schema. API routes for task CRUD, the atomic `next` endpoint (claim next pending task in a phase, set to in_progress with agentId in one operation), and the cross-project `/api/tasks/active` endpoint. CLI commands: `sm task list`, `sm task update`, `sm task next`, `sm task complete`, `sm task fail`. The `next` endpoint must be atomic to prevent two agents from claiming the same task. On the dashboard, add expandable task lists under each phase card showing task status, subject, assigned agent, and result. Add progress bars to phase cards and worktree cards (in the Kanban view) based on task completion ratios. Implement polling or auto-refresh so the dashboard reflects agent progress in near real-time. Add `sm status <worktree>` detailed view showing phase and task progress.

### Acceptance criteria

- [ ] `sm task next <phase-id> --agent <agentId>` atomically claims the next pending task
- [ ] Two concurrent `task next` calls for the same phase do not claim the same task
- [ ] `sm task complete <id> --result "done"` marks task completed with result text
- [ ] `sm task fail <id> --reason "error"` marks task failed with reason
- [ ] `sm task list --phase <id>` shows tasks with status and agent assignment
- [ ] `sm task list --status in_progress` filters across all phases
- [ ] GET `/api/tasks/active` returns all in-progress tasks across all projects
- [ ] `sm status <worktree>` shows detailed phase/task progress
- [ ] Dashboard phase cards show expandable task lists with status, agent, and result
- [ ] Dashboard worktree cards in Kanban view show progress bars based on task completion
- [ ] Dashboard refreshes automatically to reflect agent progress

---

## Phase 5: Claude Code Skill + Skill Integration
**Status**: pending

**User stories**: As a skill author, I can integrate status-manager into existing skills so agents automatically track their work. As a user, I can run /execute and see the dashboard update as agents work.

### What to build

Create the Claude Code skill at `~/.claude/skills/status-manager/SKILL.md` that documents the agent reporting protocol — how to read plans, claim tasks, and report results via `sm` CLI commands. Update the `/execute` skill to read plans from the DB instead of parsing markdown files, find the resumption point via `sm phase list --status pending`, update phase/task status via CLI, and create task records per agent step (implementer, test-writer, code-reviewer, fix-pass). Add integration hooks to `/brainstorming` (register spec after writing), `/write-a-prd` (register PRD after writing), and `/prd-to-plan` (import plan into DB after generating). These integration updates are documented as specific changes to each skill's SKILL.md file, with the `sm` commands to add at each integration point.

### Acceptance criteria

- [ ] `~/.claude/skills/status-manager/SKILL.md` exists and documents the full agent protocol
- [ ] Skill covers: context retrieval (plan show, artifact list), task claiming (task next), reporting (task complete/fail)
- [ ] `/execute` skill updated to read plan from DB via `sm plan show <worktree> --json`
- [ ] `/execute` finds resumption point via `sm phase list` instead of markdown grep
- [ ] `/execute` creates task records per agent step and updates them on completion/failure
- [ ] `/execute` updates phase status via `sm phase update` instead of editing markdown
- [ ] `/brainstorming` integration: registers spec artifact after writing design doc
- [ ] `/write-a-prd` integration: registers PRD artifact after writing
- [ ] `/prd-to-plan` integration: imports plan into DB after generating markdown
- [ ] End-to-end: running /execute against a DB-stored plan updates the dashboard in real time
