const { Command } = require("commander");
const { api } = require("../lib/api");
const { printJson, printTable } = require("../lib/output");

const VALID_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"];

const TASK_STATUS_ICONS = {
  PENDING: "○",
  IN_PROGRESS: "◉",
  COMPLETED: "✓",
  FAILED: "✗",
};

const taskCommand = new Command("task").description("Manage tasks within plan phases");

// ─── sm task next <phase-id> ──────────────────────────────────────────────────

taskCommand
  .command("next <phase-id>")
  .description("Atomically claim the next pending task in a phase")
  .requiredOption("--agent <agentId>", "Agent identifier claiming the task")
  .option("--json", "Output as JSON")
  .action(async (phaseId, opts) => {
    try {
      const task = await api.post(`/api/phases/${phaseId}/tasks/next`, {
        agentId: opts.agent,
      });

      if (opts.json) {
        printJson(task);
        return;
      }

      process.stdout.write(`Claimed task ${task.id}\n`);
      process.stdout.write(`  Subject : ${task.subject}\n`);
      process.stdout.write(`  Agent   : ${task.agentId}\n`);
      process.stdout.write(`  Status  : ${task.status}\n`);
      if (task.description) {
        process.stdout.write(`  Desc    : ${task.description}\n`);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// ─── sm task complete <id> ───────────────────────────────────────────────────

taskCommand
  .command("complete <id>")
  .description("Mark a task as completed")
  .option("--result <text>", "Result or outcome text")
  .option("--json", "Output as JSON")
  .action(async (id, opts) => {
    try {
      const task = await api.post(`/api/tasks/${id}/complete`, {
        ...(opts.result ? { result: opts.result } : {}),
      });

      if (opts.json) {
        printJson(task);
        return;
      }

      process.stdout.write(`Task ${id.slice(0, 8)} marked COMPLETED\n`);
      if (task.result) {
        process.stdout.write(`  Result: ${task.result}\n`);
      }
    } catch (err) {
      if (err.status === 400 && Array.isArray(err.body?.unmet)) {
        const { unmet } = err.body;
        process.stderr.write(`Cannot complete: ${unmet.length} acceptance criteria unmet\n\n`);
        for (const criterion of unmet) {
          const idSuffix = `(${criterion.id.slice(0, 8)})`;
          process.stderr.write(`  [ ] ${criterion.text.padEnd(44)}  ${idSuffix}\n`);
        }
        process.stderr.write(`\nUse \`sm criteria check <id>\` to mark each one done.\n`);
      } else {
        console.error(`Error: ${err.message}`);
      }
      process.exit(1);
    }
  });

// ─── sm task fail <id> ───────────────────────────────────────────────────────

taskCommand
  .command("fail <id>")
  .description("Mark a task as failed")
  .option("--reason <text>", "Failure reason")
  .option("--json", "Output as JSON")
  .action(async (id, opts) => {
    try {
      const task = await api.post(`/api/tasks/${id}/fail`, {
        ...(opts.reason ? { reason: opts.reason } : {}),
      });

      if (opts.json) {
        printJson(task);
        return;
      }

      process.stdout.write(`Task ${id.slice(0, 8)} marked FAILED\n`);
      if (task.result) {
        process.stdout.write(`  Reason: ${task.result}\n`);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// ─── sm task list ─────────────────────────────────────────────────────────────

taskCommand
  .command("list")
  .description("List tasks, optionally filtered by phase or status")
  .option("--phase <id>", "Filter to a specific phase ID")
  .option("--status <status>", `Filter by status (${VALID_STATUSES.join("|")})`)
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    try {
      let tasks;

      if (opts.phase) {
        // Fetch tasks for a specific phase
        tasks = await api.get(`/api/phases/${opts.phase}/tasks`);
      } else if (opts.status) {
        const statusUpper = opts.status.toUpperCase();
        if (statusUpper === "IN_PROGRESS") {
          // Use the dedicated cross-project active endpoint
          const activeTasks = await api.get("/api/tasks/active");
          tasks = activeTasks;
        } else {
          console.error(
            `Error: --status filter without --phase only supports 'in_progress'. ` +
              `Use --phase <id> to filter other statuses.`
          );
          process.exit(1);
        }
      } else {
        console.error("Error: Provide --phase <id> or --status in_progress");
        process.exit(1);
      }

      // Apply status filter if both --phase and --status are given
      if (opts.phase && opts.status) {
        const statusUpper = opts.status.toUpperCase();
        if (!VALID_STATUSES.includes(statusUpper)) {
          console.error(
            `Error: Invalid status '${opts.status}'. Must be one of: ${VALID_STATUSES.join(", ")}`
          );
          process.exit(1);
        }
        tasks = tasks.filter((t) => t.status === statusUpper);
      }

      if (opts.json) {
        printJson(tasks);
        return;
      }

      if (tasks.length === 0) {
        process.stdout.write("No tasks found.\n");
        return;
      }

      printTable(
        tasks.map((t) => ({
          icon: TASK_STATUS_ICONS[t.status] ?? "?",
          id: t.id.slice(0, 8),
          order: t.order ?? "",
          subject: t.subject,
          status: t.status,
          agent: t.agentId ?? "",
          result: t.result ? t.result.slice(0, 30) : "",
        })),
        [
          { key: "icon", header: " " },
          { key: "id", header: "ID" },
          { key: "order", header: "#" },
          { key: "subject", header: "SUBJECT" },
          { key: "status", header: "STATUS" },
          { key: "agent", header: "AGENT" },
          { key: "result", header: "RESULT" },
        ]
      );
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// ─── sm task add <phase-id> ───────────────────────────────────────────────────

taskCommand
  .command("add <phase-id>")
  .description("Add a task to a phase")
  .requiredOption("--subject <text>", "Task subject / short description")
  .requiredOption("--order <n>", "Task order (positive integer)", parseInt)
  .option("--description <text>", "Detailed task description")
  .option("--json", "Output as JSON")
  .action(async (phaseId, opts) => {
    try {
      if (!Number.isInteger(opts.order) || opts.order < 1) {
        console.error("Error: --order must be a positive integer");
        process.exit(1);
      }

      const task = await api.post(`/api/phases/${phaseId}/tasks`, {
        subject: opts.subject,
        order: opts.order,
        ...(opts.description ? { description: opts.description } : {}),
      });

      if (opts.json) {
        printJson(task);
        return;
      }

      process.stdout.write(
        `Added task ${task.order} '${task.subject}' to phase ${phaseId.slice(0, 8)} (${task.id})\n`
      );
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// ─── sm task update <id> ─────────────────────────────────────────────────────

taskCommand
  .command("update <id>")
  .description("Update a task")
  .option("--status <status>", `New status (${VALID_STATUSES.join("|")})`)
  .option("--subject <text>", "New subject")
  .option("--description <text>", "New description")
  .option("--result <text>", "Result text")
  .option("--agent <agentId>", "Assign agent")
  .option("--json", "Output as JSON")
  .action(async (id, opts) => {
    try {
      const updates = {};

      if (opts.status !== undefined) {
        const statusUpper = opts.status.toUpperCase();
        if (!VALID_STATUSES.includes(statusUpper)) {
          console.error(
            `Error: Invalid status '${opts.status}'. Must be one of: ${VALID_STATUSES.join(", ")}`
          );
          process.exit(1);
        }
        updates.status = statusUpper;
      }

      if (opts.subject !== undefined) updates.subject = opts.subject;
      if (opts.description !== undefined) updates.description = opts.description;
      if (opts.result !== undefined) updates.result = opts.result;
      if (opts.agent !== undefined) updates.agentId = opts.agent;

      if (Object.keys(updates).length === 0) {
        console.error(
          "Error: Provide at least one field to update (--status, --subject, --description, --result, --agent)"
        );
        process.exit(1);
      }

      const updated = await api.patch(`/api/tasks/${id}`, updates);

      if (opts.json) {
        printJson(updated);
        return;
      }

      process.stdout.write(`Updated task ${id.slice(0, 8)} '${updated.subject}'\n`);
      if (updates.status) {
        process.stdout.write(`  Status: ${updated.status}\n`);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// ─── sm task criteria <task-id> ───────────────────────────────────────────────

taskCommand
  .command("criteria <task-id>")
  .description("List acceptance criteria for a task")
  .option("--json", "Output as JSON")
  .action(async (taskId, opts) => {
    try {
      const criteria = await api.get(`/api/tasks/${taskId}/criteria`);

      if (opts.json) {
        printJson(criteria);
        return;
      }

      if (criteria.length === 0) {
        process.stdout.write("No acceptance criteria for this task.\n");
        return;
      }

      // Fetch task subject for the header
      let subject = taskId.slice(0, 8);
      try {
        const task = await api.get(`/api/tasks/${taskId}`);
        if (task?.subject) subject = task.subject;
      } catch {
        // Non-fatal — fall back to ID prefix
      }

      process.stdout.write(`Acceptance criteria for task ${taskId.slice(0, 8)} (${subject})\n\n`);

      const checkedCount = criteria.filter((c) => c.checked).length;

      for (const criterion of criteria) {
        const box = criterion.checked ? "[x]" : "[ ]";
        const idSuffix = criterion.id.slice(0, 8);
        process.stdout.write(`  ${box} ${criterion.text.padEnd(44)}  ${idSuffix}\n`);
      }

      process.stdout.write(`\n${checkedCount} of ${criteria.length} checked\n`);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// ─── sm task remove <id> ──────────────────────────────────────────────────────

taskCommand
  .command("remove <id>")
  .description("Delete a task")
  .option("--json", "Output as JSON")
  .action(async (id, opts) => {
    try {
      await api.delete(`/api/tasks/${id}`);

      if (opts.json) {
        printJson({ removed: true });
        return;
      }

      process.stdout.write(`Removed task ${id.slice(0, 8)}\n`);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

module.exports = taskCommand;
