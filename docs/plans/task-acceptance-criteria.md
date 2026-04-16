# Plan: Task Acceptance Criteria

> Source PRD: docs/specs/2026-04-16-task-acceptance-criteria-design.md

## Architectural decisions

- **New model**: `AcceptanceCriterion` — `{ id, taskId, text, checked, order }` with cascade delete from Task
- **Routes**: `/api/tasks/:id/criteria`, `/api/criteria/:id/check`, `/api/criteria/:id/uncheck`
- **Completion gate**: `POST /api/tasks/:id/complete` rejects with 400 + unmet list if unchecked criteria exist
- **Import format**: Tasks in plan markdown support `#### Acceptance criteria` checkbox blocks (same syntax as phase AC)
- **Criteria lifecycle**: Created at plan import time only — agents check/uncheck, never create or delete

---

## Phase 1: Schema
**Status**: pending

**User stories**: Data model foundation for task-level acceptance criteria

### What to build

Add the `AcceptanceCriterion` model to the Prisma schema with a cascade-delete relation to `Task`. Run the migration. No API or UI changes in this phase — just the schema foundation everything else depends on.

### Acceptance criteria

- [ ] `AcceptanceCriterion` model exists in schema with `id`, `taskId`, `text`, `checked`, `order`, `createdAt`, `updatedAt`
- [ ] `Task` model has a `criteria AcceptanceCriterion[]` relation
- [ ] Migration runs cleanly against the local database
- [ ] Deleting a task cascades to delete its criteria

---

## Phase 2: Criteria API + Completion Gate
**Status**: pending

**User stories**: Agent check-off workflow; hard gate on task completion

### What to build

Three new endpoints: list criteria for a task, mark a criterion checked, mark a criterion unchecked. Modify the existing task completion endpoint to check for unmet criteria before completing — if any are unchecked, return 400 with the list of blocking criteria. Tasks with no criteria complete as before.

### Acceptance criteria

- [ ] `GET /api/tasks/:id/criteria` returns criteria ordered by `order`
- [ ] `POST /api/criteria/:id/check` sets `checked = true`, returns updated criterion
- [ ] `POST /api/criteria/:id/uncheck` sets `checked = false`, returns updated criterion
- [ ] `POST /api/tasks/:id/complete` returns 400 with `{ error, unmet[] }` when unchecked criteria exist
- [ ] `POST /api/tasks/:id/complete` succeeds when all criteria are checked
- [ ] `POST /api/tasks/:id/complete` succeeds when a task has no criteria (unchanged behavior)
- [ ] All endpoints return 404 for unknown IDs

---

## Phase 3: Plan Parser + Import
**Status**: pending

**User stories**: Acceptance criteria pre-populated from plan markdown at import time

### What to build

Extend `plan-parser.ts` to parse `#### Acceptance criteria` blocks under each task entry (same checkbox markdown format as phase AC). Extend the plan import route to create `AcceptanceCriterion` rows from the parsed task criteria. Update `exportPlanToMarkdown` to round-trip task criteria back into the markdown output.

### Acceptance criteria

- [ ] `parsePlan()` extracts criteria from `#### Acceptance criteria` blocks under each task
- [ ] `- [ ]` items import as `checked = false`; `- [x]` items import as `checked = true`
- [ ] Plan import route creates `AcceptanceCriterion` rows for each parsed task criterion
- [ ] `exportPlanToMarkdown()` includes `#### Acceptance criteria` blocks for tasks that have criteria
- [ ] A plan with no task-level AC imports and exports without errors
- [ ] Criterion `order` matches the order items appear in the markdown

---

## Phase 4: CLI
**Status**: pending

**User stories**: Full agent CLI workflow — list, check off, remove tasks

### What to build

Four CLI additions: `sm task criteria <task-id>` lists a task's criteria with IDs and check state; `sm criteria check <id>` and `sm criteria uncheck <id>` are new top-level subcommands for toggling individual criteria; `sm task remove <id>` deletes a task. Update `sm task complete` to print a clear error with criterion IDs when blocked.

### Acceptance criteria

- [ ] `sm task criteria <task-id>` lists criteria with check state, criterion IDs, and a summary count
- [ ] `sm criteria check <id>` marks a criterion checked and confirms in output
- [ ] `sm criteria uncheck <id>` marks a criterion unchecked and confirms in output
- [ ] `sm task remove <id>` deletes the task and exits 0 on success
- [ ] `sm task complete <id>` prints unchecked criteria with their IDs and a hint to use `sm criteria check`
- [ ] All new commands support `--json` for machine-readable output
- [ ] All new commands exit 1 with a clear error message on failure

---

## Phase 5: UI
**Status**: pending

**User stories**: Dashboard visibility into task-level acceptance criteria

### What to build

Include criteria in the `getWorktreeDetail` service query so they're available on the worktree detail page. Render task criteria as a read-only checklist in `PhaseCard.tsx` below each task's subject line when the phase is expanded, reusing the existing `CriteriaList` component. Checked items are visually distinct (dimmed + checkmark); unchecked items show an empty box. No interactive toggling — agents use the CLI.

### Acceptance criteria

- [ ] `getWorktreeDetail` includes `criteria` in its task select, ordered by `order`
- [ ] `Task` type in `PhaseCard.tsx` includes a `criteria` array
- [ ] Tasks with criteria show a checklist below the subject line when a phase is expanded
- [ ] Tasks without criteria render unchanged
- [ ] Checked and unchecked criteria are visually distinct
