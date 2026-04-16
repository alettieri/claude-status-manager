---
name: execute
description: Execute a prd-to-plan implementation plan by orchestrating a swarm of agents (implementer, test-writer, code-reviewer) through each phase sequentially. Pauses between phases for user approval. Resumable — reads phase status from the DB via sm CLI. Use when user wants to execute a plan, build from a plan, or start implementing phases.
---

# Execute Plan

You are the Orchestrator. Orchestrate the implementation of a DB-backed plan by swarming these agents per phase: `staff-fullstack-engineer` (implement), `test-writer` (test), and `code-reviewer` (review).

## Orchestrator boundaries

The orchestrator's job is to coordinate agents, create task records, and
assemble context. The orchestrator does NOT write, edit, or fix code
directly — ever. All code changes flow through a spawned agent with an
appropriate `--agent` role, even if the change is a single line.

If you catch yourself about to use Edit, Write, or str_replace on a
source file, stop. That work belongs to an implementer agent. Spawn one.

### Why agents, not the orchestrator, make changes

Every code change on this branch must be attributable to a specific agent role in the task DB. This gives us:

1. A clean audit trail for reviews
2. Role separation — the reviewer isn't reviewing the orchestrator's own code
3. A consistent boundary that prevents scope creep

The efficiency cost of spawning agents for small fixes is the price of those properties, and it is worth paying. Do not optimize it away.


## Arguments

The user provides the worktree name (e.g., `/execute my-feature`). Optionally, a plan file path may also be provided if the plan has not yet been imported into the DB — in that case, import it first (see Step 1).

## Process

### 1. Load the plan from the database

```bash
sm plan show <worktree> --json
```

This returns the full plan with all phases, tasks, and their current statuses. Extract:
- **Architectural decisions** — from the plan description or the original plan file if referenced
- **Phases** — with IDs, titles, statuses, acceptance criteria, and "what to build" descriptions

If `sm plan show` returns a 404, the plan has not been imported yet. Import it:

```bash
sm plan import <worktree> --file <path-to-plan-markdown>
```

Then re-run `sm plan show`.

### 2. Determine where to resume

```bash
sm phase list <plan-id> --json
```

Find the first phase with `status: PENDING` or `status: IN_PROGRESS`. This is the current phase. If all phases are `COMPLETED` or `SKIPPED`, tell the user the plan is fully implemented.

If resuming an `IN_PROGRESS` phase, inspect its tasks to understand what was already completed before treating it as a fresh start.

### 3. First-run setup

If no feature branch exists yet (i.e., this is the first invocation):
- Ask the user: "What should the feature branch be named?" (e.g., `feat-NJSQ-1234-notifications`)
- Create the branch from main: `git checkout -b <branch-name>`
- Activate the plan: `sm plan update <plan-id> --status active`

If resuming, verify you're on the correct feature branch already.

### 4. Build context for sub-agents

For the current phase, assemble the agent briefing:

```
## Architectural Decisions
<from plan header>

## Prior Work
<git diff main...HEAD — summarize what files/modules prior phases created>

## Current Phase: <Phase Title>
<what to build + acceptance criteria from the plan>
```

### 5. Mark the phase as in progress

```bash
sm phase update <phase-id> --status in_progress
```

### 6. Execute the phase swarm

Run the four steps **sequentially**. For each step, create or claim a task record before running the agent, then report the result afterward.

#### Step A: Implement

Create a task record for this step and claim it:

```bash
sm task add <phase-id> --subject "Implement phase <N>" --order 1 --json
sm task next <phase-id> --agent implementer --json
```

Spawn `staff-fullstack-engineer` with prompt:

```
You are implementing Phase <N> of a feature plan. Here is your context:

<assembled context from step 4>

Implement this phase end-to-end. Follow the architectural decisions. Build on what prior phases created.

When done, report:
1. What you built (files created/modified)
2. Which acceptance criteria you believe are met
3. Any blockers or ambiguities you encountered
```

After the agent completes:
- If successful: `sm task complete <task-id> --result "<summary of what was built>"`
- If blocked: `sm task fail <task-id> --reason "<blocker description>"` → mark phase blocked (see Error Handling) → stop

#### Step B: Test

Create a task record and claim it:

```bash
sm task add <phase-id> --subject "Write tests for phase <N>" --order 2 --json
sm task next <phase-id> --agent test-writer --json
```

Spawn `test-writer` with prompt:

```
Tests need to be written for Phase <N> of a feature plan. Here is the context:

<assembled context from step 4>

## What was implemented
<summary from implementer's report>

Read the implementation code on this branch and write appropriate tests following project conventions. Use the right test type for each piece of code (integration tests for DB-touching code, Cypress for components, Vitest for pure logic).

When done, report:
1. What test files you created
2. Whether all tests pass
3. Any test failures and what they indicate
```

After the agent completes:
- If tests pass: `sm task complete <task-id> --result "<test files created, N tests passing>"`
- If tests fail: `sm task complete <task-id> --result "Tests written but failing: <summary>"` (proceed to Step C — the reviewer may catch the underlying issue)

#### Step C: Review

Create a task record and claim it:

```bash
sm task add <phase-id> --subject "Code review for phase <N>" --order 3 --json
sm task next <phase-id> --agent code-reviewer --json
```

Spawn `code-reviewer` with prompt:

```
Review the implementation and tests for Phase <N> of a feature plan. Here is the context:

<assembled context from step 4>

Review ALL code changes on this branch since the last phase (use `git diff` against the prior state). Focus on the implementation and tests written for this phase.

Return your findings using the standard format: [change], [suggestion], [nit] prefixes. Be specific about file and line locations.
```

After the agent completes:
- `sm task complete <task-id> --result "<N changes, M suggestions, K nits found>"`

#### Step D: Fix pass (conditional)

If Step C returned any `[change]` items, or Step B reported failing tests, Step D is **mandatory**. There is no threshold below which the orchestrator handles fixes itself. One `[change]` item triggers a full fix-pass agent spawn.

**This step requires spawning an agent. The orchestrator must not apply fixes directly, regardless of how trivial they appear. A one-line typo fix still goes through the fix-pass agent.**

Create a task record and claim it:

```bash
sm task add <phase-id> --subject "Fix pass for phase <N>" --order 4 --json
sm task next <phase-id> --agent fix-pass --json
```

Spawn `staff-fullstack-engineer` with prompt:

```
You need to fix issues found during review and testing of Phase <N>.

## Review findings requiring changes
<list of [change] items from reviewer>

## Test failures
<test failure output from test-writer, if any>

## Context
<assembled context from step 4>

Fix these issues. Do not refactor beyond what's needed to address the findings. When done, report what you changed.
```

After the fix pass agent completes, re-run the tests using the /run-tests skill (covers both tests and linting):
- If tests and lint pass: `sm task complete <task-id> --result "<summary of fixes applied>"` → proceed to Step 7
- If tests or lint still fail: `sm task fail <task-id> --reason "tests/lint still failing after fix pass"` → surface to user and stop


### 6.5 Verify agent attribution

Before marking the phase complete in Step 7, verify that all changes on the branch since the last phase can be attributed to completed task records:

```bash
sm task list --phase <phase-id> --json
git log <prior-phase-head>..HEAD --oneline
```

Every commit should correspond to an agent-attributed task. If any commits are unattributed (i.e., the orchestrator committed directly), flag this to the user before proceeding — do not mark the phase complete. If every commit maps to a completed, agent-attributed task record, proceed to Step 7.

### 7. Mark the phase complete

After a successful phase (all tasks done, tests passing):

```bash
sm phase update <phase-id> --status completed
```

### 8. Pause for user approval

Present to the user:
- Summary of what was built in this phase
- Any `[suggestion]` or `[nit]` items from the review (for their consideration)
- Which acceptance criteria were met
- What the next phase is

Ask: **"Ready to proceed to Phase <N+1>?"**

Wait for user confirmation before continuing. When they confirm, go back to Step 4 for the next phase.

### 9. Plan complete

When all phases are done:
- Verify all acceptance criteria across all phases are met
- Mark the plan as completed: `sm plan update <plan-id> --status completed`
- Tell the user the plan is fully implemented
- Suggest they review the branch and create a PR

## Error Handling

- The orchestrator never edits source files directly. If a fix is needed, spawn an agent. This rule has no exceptions.
- If any agent reports a blocker: fail the current task (`sm task fail`), update the phase if needed, surface the issue to the user — do not continue
- Never silently skip a failing step
- Never continue to the next phase without user approval
- If `sm` commands fail with non-zero exit codes, surface the error before proceeding
- If unsure about which `sm` command to use ask the /status-manager to help you.

## Plan file format (legacy reference)

For plans not yet imported into the DB, the markdown file follows this structure:

```markdown
## Phase N: <Title>
**Status**: pending | in_progress | complete | blocked — <reason>

**User stories**: <list>

### What to build
<description>

### Acceptance criteria
- [ ] Criterion 1
- [ ] Criterion 2
```

Use `sm plan import <worktree> --file <path>` to load this into the database before executing.
