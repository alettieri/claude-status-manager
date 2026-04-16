# Task Acceptance Criteria

**Date:** 2026-04-16
**Status:** Draft

## Problem

Agents currently have no structured way to track acceptance criteria at the task level. When AC appear in a task description as free-form text, nothing checks them off. Phase-level AC exist in the DB but are display-only. Tasks need first-class, checkable AC so agents can be precise about what "done" means.

## Scope

Task-level acceptance criteria only. Phase-level AC normalization is out of scope for this iteration.

## Data Model

New table:

```prisma
model AcceptanceCriterion {
  id        String   @id @default(uuid())
  taskId    String
  text      String
  checked   Boolean  @default(false)
  order     Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@index([taskId])
}
```

`Task` gains a `criteria AcceptanceCriterion[]` relation. No other schema changes.

## Plan Markdown Format

Tasks in plan files support a `#### Acceptance criteria` subsection using the same checkbox markdown format as phase AC:

```markdown
### Phase 1: Setup

#### Tasks

1. **Configure database**
   Set up the Postgres connection and run migrations.

   #### Acceptance criteria
   - [ ] DATABASE_URL is set in .env
   - [ ] `prisma migrate dev` runs without errors
   - [ ] Connection test passes
```

- `- [ ]` imports as `checked = false`
- `- [x]` imports as `checked = true`
- Criteria are created only during plan import — agents do not add criteria at runtime

## API

### New endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tasks/:id/criteria` | List all criteria for a task |
| `POST` | `/api/criteria/:id/check` | Mark a criterion checked |
| `POST` | `/api/criteria/:id/uncheck` | Mark a criterion unchecked |

### Modified endpoint

**`POST /api/tasks/:id/complete`**

- If the task has no criteria → completes as before
- If all criteria are checked → completes
- If any criteria are unchecked → returns `400`:

```json
{
  "error": "Cannot complete: 2 acceptance criteria unmet",
  "unmet": [
    { "id": "abc123", "text": "DATABASE_URL is set in .env" },
    { "id": "def456", "text": "Connection test passes" }
  ]
}
```

All responses follow the existing `{ error: string }` convention; the `unmet` field is additive.

## CLI

Two new top-level subcommands (agents reference criteria by ID directly):

```bash
sm criteria check <id>      # mark a criterion checked
sm criteria uncheck <id>    # unmark a criterion (corrections)
```

New subcommands under `sm task`:

```bash
sm task criteria <task-id>  # list criteria with IDs and check state
sm task remove <id>         # delete a task (and its criteria)
```

Note: `sm task add <phase-id> --subject <text> --order <n>` already exists and is unchanged.

Example output of `sm task criteria <task-id>`:

```
Acceptance criteria for task abc123 (Configure database)

  [x] DATABASE_URL is set in .env           crit_1a2b
  [ ] `prisma migrate dev` runs without errors  crit_3c4d
  [ ] Connection test passes                crit_5e6f

1 of 3 checked
```

Updated behavior of `sm task complete <id>`:

```
Cannot complete: 2 acceptance criteria unmet

  [ ] `prisma migrate dev` runs without errors  (crit_3c4d)
  [ ] Connection test passes                    (crit_5e6f)

Use `sm criteria check <id>` to mark each one done.
```

Exits with code `1` on blocked completion.

## UI

`PhaseCard.tsx` renders task criteria as a read-only checklist below each task's subject line when the phase is expanded, using the same visual style as phase AC (`CriteriaList` component). Checked items are dimmed with a checkmark; unchecked items show an empty box. No interactive toggling — agents use the CLI.

The `Task` type in `PhaseCard.tsx` gains a `criteria` array. The `getWorktreeDetail` service query includes criteria in its task select.

## Agent Workflow

The typical agent loop with criteria:

```bash
sm task next <phase-id> --agent my-agent     # claim task
sm task criteria <task-id>                   # review what done looks like
# ... do the work ...
sm criteria check <crit-id>                  # check off each criterion
sm criteria check <crit-id>
sm task complete <task-id> --result "..."    # completes only when all checked
```

## Out of Scope

- Agent-created criteria at runtime
- Phase-level AC normalization to structured records
- Interactive UI checkboxes (UI remains read-only; CLI is the agent interface)
- Criteria editing or deletion after import
