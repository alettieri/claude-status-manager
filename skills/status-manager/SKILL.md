---
name: status-manager
description: Agent reporting protocol for the status-manager system. Documents how to read plans, claim tasks, and report results via the sm CLI. Use this as a reference whenever an agent needs to interact with a DB-backed plan — retrieving context, claiming tasks atomically, and reporting completion or failure.
---

# Status Manager — Agent Reporting Protocol

This skill documents the protocol agents use to interact with the status-manager system. The `sm` CLI is the only interface agents should use — never import Prisma or call the API directly.

Prerequisite: the Next.js dashboard must be running (`pnpm dev` from the status-manager directory) and `SM_API_URL` must point to it (default: `http://localhost:4000`).

---

## 1. Getting Context

Before doing any work, retrieve the full plan and current state for the target worktree.

### Fetch the plan (structured)

```bash
sm plan show <worktree-name> --json
```

Returns a JSON object with:
- `plan.id` — plan UUID (needed for phase operations)
- `plan.phases[]` — array of phases, each with:
  - `phase.id` — phase UUID (needed for task operations)
  - `phase.name`
  - `phase.status` — `PENDING` | `IN_PROGRESS` | `COMPLETED` | `SKIPPED`
  - `phase.tasks[]` — tasks within the phase, each with `id`, `subject`, `status`, `agentId`

### Fetch artifacts (specs, PRDs)

```bash
sm artifact list <worktree-name> --json
```

Returns specs and PRDs registered for this worktree. Each artifact has a `filePath` and an optional `content` snapshot.

### Get high-level status

```bash
sm status <worktree-name> --json
```

Returns the worktree stage, plan summary, phase progress counts, and active tasks. Use this for a quick overview before diving into the full plan.

---

## 2. Finding the Resumption Point

To find which phase to work on next:

```bash
sm phase list <plan-id> --json
```

Find the first phase with `"status": "PENDING"` or `"status": "IN_PROGRESS"`. If all phases are `COMPLETED` or `SKIPPED`, the plan is fully executed — report this to the user.

If a phase has status `IN_PROGRESS`, it was interrupted. Check its tasks to understand what was completed and what still needs doing before treating it as a fresh start.

---

## 3. Updating Plan and Phase Status

### Plan status

Plans have four statuses: `DRAFT` → `ACTIVE` → `COMPLETED` | `ARCHIVED`.

Activate a plan when starting execution:

```bash
sm plan update <plan-id> --status active
```

Mark a plan complete when all phases are done:

```bash
sm plan update <plan-id> --status completed
```

You can also update the title or description:

```bash
sm plan update <plan-id> --title "New title" --description "New description"
```

### Phase status

Mark a phase as started before beginning work on it:

```bash
sm phase update <phase-id> --status in_progress
```

Mark a phase complete after all tasks succeed and tests pass:

```bash
sm phase update <phase-id> --status completed
```

Mark a phase skipped (with reason):

```bash
sm phase update <phase-id> --status skipped
```

---

## 4. Claiming Tasks

Tasks within a phase map to discrete agent steps. Use atomic claiming to prevent race conditions when multiple agents are running.

### Claim the next pending task in a phase

```bash
sm task next <phase-id> --agent <agent-id>
```

- `<agent-id>` should identify the agent type, e.g., `implementer`, `test-writer`, `code-reviewer`, `fix-pass`
- Returns the claimed task as JSON, including its `id`
- If no pending tasks remain, returns a `404` — the phase is fully claimed
- The task status transitions from `PENDING` to `IN_PROGRESS` atomically

### Create a task record for a specific step

If the plan phases do not pre-define tasks (e.g., the phase has no tasks yet), create one before starting:

```bash
sm task add <phase-id> --subject "<step description>" --order <n> --json
```

Returns the new task as JSON with its `id`. Then claim it immediately:

```bash
sm task next <phase-id> --agent <agent-id> --json
```

The `--order` is a positive integer indicating the task's position within the phase (1, 2, 3, etc.).

---

## 5. Acceptance Criteria

After claiming a task, check whether it has acceptance criteria before starting work:

```bash
sm task criteria <task-id>
```

Output lists each criterion with its ID and check state:

```
Acceptance criteria for task abc123 (Configure database)

  [x] DATABASE_URL is set in .env           crit_1a2b
  [ ] `prisma migrate dev` runs without errors  crit_3c4d
  [ ] Connection test passes                crit_5e6f

1 of 3 checked
```

If criteria exist, treat them as the definition of done for the task. Check each one off as you satisfy it:

```bash
sm criteria check <criterion-id>
```

To uncheck a criterion (e.g., you realised it wasn't actually satisfied):

```bash
sm criteria uncheck <criterion-id>
```

Tasks with no criteria behave as before — `sm task complete` succeeds without any AC check.

---

## 6. Reporting Results

After completing work for a task — and checking off all acceptance criteria:

```bash
sm task complete <task-id> --result "<summary of what was done>"
```

If unchecked criteria remain, `sm task complete` will fail with a list of what's blocking:

```
Cannot complete: 2 acceptance criteria unmet

  [ ] `prisma migrate dev` runs without errors  (crit_3c4d)
  [ ] Connection test passes                    (crit_5e6f)

Use `sm criteria check <id>` to mark each one done.
```

Do not force past this gate. Either satisfy the criterion and check it off, or mark the task failed if it genuinely cannot be completed.

If the task failed (blocker, test failure, unresolvable error):

```bash
sm task fail <task-id> --reason "<what went wrong>"
```

The `--result` and `--reason` strings are stored in the database and visible on the dashboard. Be concise but informative — one to three sentences describing outcome and any relevant file paths.

---

## 7. Full Agent Workflow

The canonical loop for an agent executing a plan:

```
1. sm plan show <worktree> --json              → load plan + phase IDs
1b. sm plan update <plan-id> --status active    → activate plan on first run
2. sm phase list <plan-id> --json              → find first PENDING/IN_PROGRESS phase
3. sm phase update <phase-id> --status in_progress
4. For each agent step in the phase:
   a. sm task add <phase-id> --subject "..." --order <n>  → create task (if not pre-defined)
      sm task next <phase-id> --agent <id>               → claim it (get task-id)
   b. sm task criteria <task-id>                         → review acceptance criteria
   c. Do the work, checking off criteria as each is satisfied:
      sm criteria check <criterion-id>
   d. sm task complete <task-id> --result "..." (or sm task fail ...)
5. sm phase update <phase-id> --status completed
6. Report to user → wait for approval → repeat from step 2
7. sm plan update <plan-id> --status completed  → mark plan done when all phases complete
```

---

## 8. Agent ID Conventions

Use these consistent identifiers for `--agent` so the dashboard can group by agent type:

| Step | Agent ID |
|------|----------|
| Implementation | `implementer` |
| Test writing | `test-writer` |
| Code review | `code-reviewer` |
| Fix pass | `fix-pass` |
| Custom/ad-hoc | descriptive kebab-case string |

---

## 9. Worktree Name Resolution

The worktree name is the short identifier used in `sm` commands (not a filesystem path). To determine it:

1. Check the current git directory name: the worktree name is typically the bare directory name of the worktree folder (e.g., `my-feature` for `/path/to/my-feature/`)
2. Run `sm status --json` (no argument) to list all worktrees and find the one matching the current path
3. Ask the user if it cannot be determined automatically

---

## 10. Error Handling

- If `sm task next` returns `404`: no tasks remain in this phase — proceed to marking the phase complete
- If `sm plan show` returns `404`: the plan has not been imported into the DB. Ask the user to run `sm plan import <worktree> --file <path>`
- If `sm task complete` exits non-zero with unmet criteria: do not force past the gate. Check off each listed criterion with `sm criteria check <id>` once the work is genuinely done, then retry `sm task complete`
- If any `sm` command exits non-zero: surface the error output to the user before continuing
- Never silently skip a failed `sm` call — the dashboard state depends on accurate reporting
