# Status Manager — Design Spec

A local project tracking tool for managing the spec → PRD → plan → execution pipeline across multiple git worktrees.

## Problem

When working on a project with multiple feature slices in separate git worktrees, there's no unified way to see where each slice is in the development pipeline. Specs, PRDs, plans, and execution status are scattered across worktree directories with no central overview or machine-readable interface for agents to report progress.

Additionally, plans are tied to the filesystem of each worktree, meaning you must be in the right directory to see or work on a plan. Agents need filesystem access to the worktree just to read their assignments.

## Solution

A standalone local application backed by PostgreSQL that:

1. Tracks projects and their associated git worktrees
2. Models the pipeline lifecycle: Spec → PRD → Plan → Executing → Done
3. **Stores plans centrally in the database** — phases, tasks, acceptance criteria, descriptions — accessible from any directory
4. Stores specs and PRDs as references (file path + optional read-only content snapshot)
5. Provides a web dashboard for visual overview and drill-down
6. Provides a CLI (`sm`) for agents and quick terminal access
7. Provides a Claude Code skill for agent/skill integration
8. Syncs with the filesystem to discover existing spec and PRD artifacts

## Tech Stack

- **Runtime:** Node.js / TypeScript
- **Web framework:** Next.js (App Router)
- **Database:** PostgreSQL (local, via Docker Compose)
- **ORM:** Prisma
- **CLI:** commander.js (calls API over HTTP)
- **Package manager:** pnpm

## Data Model

### Project

| Field       | Type     | Description                  |
|-------------|----------|------------------------------|
| id          | UUID     | Primary key                  |
| name        | String   | Project name (e.g., "productiv") |
| description | String?  | Optional description         |
| basePath    | String   | Absolute path to git repo root |
| createdAt   | DateTime | Auto-set                     |
| updatedAt   | DateTime | Auto-updated                 |

### Worktree

| Field     | Type     | Description                              |
|-----------|----------|------------------------------------------|
| id        | UUID     | Primary key                              |
| projectId | UUID     | FK → Project                             |
| name      | String   | Short name (e.g., "auth-system")         |
| path      | String   | Absolute filesystem path                 |
| branch    | String   | Git branch name                          |
| stage     | Enum     | IDEA, SPEC, PRD, PLAN, EXECUTING, DONE   |
| createdAt | DateTime | Auto-set                                 |
| updatedAt | DateTime | Auto-updated                             |

### Artifact (Specs & PRDs only)

Specs and PRDs remain file-backed. The database stores a reference and an optional read-only content snapshot (ingested at registration time) so agents can access them via the API without needing filesystem access to the worktree.

| Field      | Type     | Description                              |
|------------|----------|------------------------------------------|
| id         | UUID     | Primary key                              |
| worktreeId | UUID     | FK → Worktree                            |
| type       | Enum     | SPEC, PRD                                |
| filePath   | String   | Absolute path to markdown file           |
| title      | String   | Artifact title                           |
| content    | String?  | Read-only snapshot of file content (ingested at registration/sync) |
| status     | Enum     | DRAFT, REVIEW, APPROVED                  |
| createdAt  | DateTime | Auto-set                                 |
| updatedAt  | DateTime | Auto-updated                             |

### Plan (database-owned, not file-backed)

Plans are fully stored in the database. They are the central, location-independent record of what needs to be built. A plan can be viewed, queried, and updated from any directory via the CLI or API.

| Field              | Type     | Description                              |
|--------------------|----------|------------------------------------------|
| id                 | UUID     | Primary key                              |
| worktreeId         | UUID     | FK → Worktree                            |
| title              | String   | Plan title                               |
| description        | String?  | High-level plan description              |
| architecturalNotes | String?  | Key decisions, constraints, context that all agents need |
| status             | Enum     | DRAFT, ACTIVE, COMPLETED, ARCHIVED       |
| createdAt          | DateTime | Auto-set                                 |
| updatedAt          | DateTime | Auto-updated                             |

### Phase

| Field              | Type     | Description                          |
|--------------------|----------|--------------------------------------|
| id                 | UUID     | Primary key                          |
| planId             | UUID     | FK → Plan                            |
| name               | String   | Phase name                           |
| description        | String?  | What to build in this phase          |
| order              | Int      | Sort order within the plan           |
| status             | Enum     | PENDING, IN_PROGRESS, COMPLETED, SKIPPED |
| acceptanceCriteria | String?  | What "done" looks like (markdown)    |
| createdAt          | DateTime | Auto-set                             |
| updatedAt          | DateTime | Auto-updated                         |

### Task

| Field       | Type     | Description                              |
|-------------|----------|------------------------------------------|
| id          | UUID     | Primary key                              |
| phaseId     | UUID     | FK → Phase                               |
| subject     | String   | Brief task title                         |
| description | String?  | Detailed description                     |
| status      | Enum     | PENDING, IN_PROGRESS, COMPLETED, FAILED  |
| order       | Int      | Sort order within phase                  |
| agentId     | String?  | Identifier of the agent working on it    |
| result      | String?  | Agent output/notes on completion or failure |
| createdAt   | DateTime | Auto-set                                 |
| updatedAt   | DateTime | Auto-updated                             |

## API Design

RESTful API via Next.js API routes. All endpoints under `/api/`.

### Projects

```
GET    /api/projects              — list all projects
POST   /api/projects              — create project { name, basePath, description? }
GET    /api/projects/:id          — get project with worktree summary
PATCH  /api/projects/:id          — update project fields
DELETE /api/projects/:id          — delete project and all associated data
```

### Worktrees

```
GET    /api/projects/:id/worktrees   — list worktrees for a project
POST   /api/projects/:id/worktrees   — register worktree { name, path, branch }
GET    /api/worktrees/:id            — get worktree with artifacts + plan summary
PATCH  /api/worktrees/:id            — update worktree (stage, etc.)
DELETE /api/worktrees/:id            — unregister worktree
POST   /api/worktrees/:id/sync       — scan filesystem for specs/PRDs, reconcile
```

### Artifacts (Specs & PRDs)

```
POST   /api/worktrees/:id/artifacts  — register artifact { type, filePath, title }
                                       Reads file content and stores snapshot
GET    /api/artifacts/:id            — get artifact (includes content snapshot)
PATCH  /api/artifacts/:id            — update artifact (status, title)
POST   /api/artifacts/:id/refresh    — re-read file content, update snapshot
```

### Plans

```
POST   /api/worktrees/:id/plan       — create plan { title, description?, architecturalNotes? }
GET    /api/plans/:id                — get plan with phases and tasks
PATCH  /api/plans/:id                — update plan fields
DELETE /api/plans/:id                — delete plan
GET    /api/plans/:id/export         — export plan as markdown (read-only view)
POST   /api/plans/:id/import         — import plan from markdown file (parse phases/tasks into DB)
```

### Phases

```
GET    /api/plans/:id/phases         — list phases for a plan
POST   /api/plans/:id/phases         — create phase { name, description, order, acceptanceCriteria }
PATCH  /api/phases/:id               — update phase (status, description, etc.)
DELETE /api/phases/:id               — delete phase
```

### Tasks

```
GET    /api/phases/:id/tasks         — list tasks for a phase
POST   /api/phases/:id/tasks         — create task { subject, description? }
PATCH  /api/tasks/:id                — update task (status, agentId, result)
POST   /api/phases/:id/tasks/next    — atomically claim next pending task (sets in_progress + agentId)
GET    /api/tasks/active             — list all in-progress tasks across all projects
```

## CLI Design

Binary name: `sm`. Installed via the project's `package.json` `bin` field. All commands call the local API over HTTP (requires Next.js dev server running).

### Project management

```
sm project add <name> --path <basePath>
sm project list
sm project remove <name>
```

### Worktree tracking

```
sm worktree add <name> --project <project> --path <path> --branch <branch>
sm worktree list [--project <project>]
sm worktree sync [<name>]             — rescan filesystem for specs/PRDs
sm worktree stage <name> <stage>      — manually set pipeline stage
```

### Artifact registration (specs & PRDs)

```
sm artifact add <worktree> --type spec|prd --file <path>
sm artifact list <worktree>
sm artifact status <id> draft|review|approved
sm artifact refresh <id>              — re-read file, update content snapshot
```

### Plan management

```
sm plan create <worktree> --title <title>
sm plan show <worktree>               — display full plan from anywhere
sm plan import <worktree> --file <path>  — parse markdown plan into DB
sm plan export <worktree>             — render plan as markdown to stdout
```

### Phase management

```
sm phase add <plan-id> --name <name> --order <n>
sm phase list <plan-id>
sm phase update <id> --status <status>
```

### Task execution (primary agent interface)

```
sm task list [--phase <id>] [--status pending|in_progress|completed|failed]
sm task update <id> --status <status> [--agent <agentId>]
sm task next <phase-id>               — claim next pending task, mark in_progress
sm task complete <id> [--result <text>]  — mark completed with optional output
sm task fail <id> --reason <text>     — mark failed with reason
```

### Quick status

```
sm status                             — overview of all projects and worktree progress
sm status <worktree>                  — detailed view for one worktree
```

All commands output plain text by default. Pass `--json` for machine-readable output.

## Claude Code Skill

A skill at `~/.claude/skills/status-manager/SKILL.md` that teaches agents how to interact with the status manager. This skill is a dependency for other skills that need to read or update project status.

### What the skill provides

1. **Context injection** — when an agent starts work on a worktree, the skill tells it how to:
   - Read the current plan: `sm plan show <worktree> --json`
   - See what's assigned to it: `sm task list --status in_progress --agent <self> --json`
   - Claim work: `sm task next <phase-id> --agent <agentId> --json`

2. **Reporting protocol** — standardized instructions for agents:
   - On start: `sm task next <phase-id> --agent <agentId>`
   - On progress: (no intermediate updates needed — keep it simple)
   - On success: `sm task complete <task-id> --result "what was done"`
   - On failure: `sm task fail <task-id> --reason "what went wrong"`

3. **Context retrieval** — agents can read specs and PRDs without filesystem access:
   - `sm artifact list <worktree> --json` → get artifact IDs
   - Artifact content is available via the API (stored snapshot)

### Skill trigger

The skill activates when any agent or skill needs to interact with project tracking — reading plan status, claiming tasks, or reporting results.

## Skill Integration Updates

Existing skills need modifications to work with the status manager:

### /execute

The largest change. Today /execute parses plan markdown files for `Status: pending` and edits them to track progress. With status-manager:

1. **Read plan from DB instead of filesystem:**
   - Replace: parse `docs/plans/<name>.md` for phases and status
   - With: `sm plan show <worktree> --json`

2. **Find resumption point from DB:**
   - Replace: grep for `Status: pending` in markdown
   - With: `sm phase list <plan-id> --status pending --json` → first result

3. **Update status via CLI instead of markdown edits:**
   - Replace: edit markdown `Status: complete`
   - With: `sm phase update <phase-id> --status completed`

4. **Create task records per agent step:**
   - Before spawning implementer: `sm task next <phase-id> --agent staff-fullstack-engineer`
   - Before spawning test-writer: create/claim test task
   - Before spawning code-reviewer: create/claim review task
   - After each agent: `sm task complete <id>` or `sm task fail <id>`

5. **Pass context from DB to agents:**
   - Architectural notes: from `plan.architecturalNotes`
   - Phase description: from `phase.description`
   - Acceptance criteria: from `phase.acceptanceCriteria`
   - Prior work: still via `git diff main...HEAD` (git remains source of truth for code)

### /prd-to-plan

After generating the plan markdown, import it into the database:

1. Write the plan markdown as usual (for reference/export)
2. Call `sm plan create <worktree> --title <title>`
3. Call `sm plan import <worktree> --file <path>` to parse phases and tasks into DB
4. Call `sm artifact add <worktree> --type prd --file <prd-path>` if not already registered

### /write-a-prd

After writing the PRD file:

1. Register it: `sm artifact add <worktree> --type prd --file <path>`
2. This ingests content and advances worktree stage to PRD

### /brainstorming

After writing the spec file:

1. Register it: `sm artifact add <worktree> --type spec --file <path>`
2. This ingests content and advances worktree stage to SPEC

## Dashboard UI

### Main View — Pipeline Kanban

A Kanban board with columns for each pipeline stage: Spec → PRD → Plan → Executing → Done. Each worktree appears as a card in its current stage column showing:

- Worktree name and branch
- Artifact status (draft/review/approved)
- Progress bar and task counts (for executing worktrees)

Top bar shows the current project name and summary counts.

### Worktree Detail View

Accessed by clicking a worktree card. Shows:

- Breadcrumb navigation back to dashboard
- Tabs for each artifact type (Spec / PRD / Plan)
- Spec and PRD tabs show the content snapshot (rendered markdown)
- Plan tab displays phases with expandable task lists
- Each task shows status, subject, assigned agent, and result (if completed)
- Phase progress indicators

### Interactivity

- Click worktree cards to navigate to detail view
- Click phase cards to expand/collapse task lists
- Manually update worktree stage or artifact status via the UI
- Auto-refresh or polling to reflect agent progress in real time

## Filesystem Sync

The sync operation (`sm worktree sync` / `POST /api/worktrees/:id/sync`) scans a worktree's directory for specs and PRDs:

- `docs/specs/*.md` or `docs/superpowers/specs/*.md` → registers as SPEC artifacts
- `docs/prd/*.md` → registers as PRD artifacts

Sync behavior:
- New files discovered → create artifact records with content snapshot
- Files that no longer exist → mark artifacts as removed (soft delete)
- Worktree stage auto-advances based on highest artifact type present
- Content snapshots are updated on sync

Plans are NOT discovered via filesystem sync — they are created and managed entirely through the CLI/API.

## Infrastructure

### Docker Compose

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: status_manager
      POSTGRES_USER: sm
      POSTGRES_PASSWORD: sm_local
    ports:
      - "5434:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

### Development

```bash
docker compose up -d          # start postgres
npx prisma migrate dev        # run migrations
npm run dev                   # start Next.js (dashboard + API)
```

### Environment

```
DATABASE_URL=postgresql://sm:sm_local@localhost:5434/status_manager
SM_API_URL=http://localhost:3000  # used by CLI
```
