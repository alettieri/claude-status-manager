const { Command } = require("commander");
const { api } = require("../lib/api");
const { printJson, printTable } = require("../lib/output");

const VALID_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "SKIPPED"];

const phaseCommand = new Command("phase").description("Manage plan phases");

phaseCommand
  .command("list <plan-id>")
  .description("List all phases for a plan")
  .option("--json", "Output as JSON")
  .action(async (planId, opts) => {
    try {
      const phases = await api.get(`/api/plans/${planId}/phases`);

      if (opts.json) {
        printJson(phases);
        return;
      }

      if (phases.length === 0) {
        process.stdout.write(`No phases found for plan ${planId.slice(0, 8)}.\n`);
        return;
      }

      printTable(
        phases.map((p) => ({
          order: p.order,
          id: p.id.slice(0, 8),
          name: p.name,
          status: p.status,
          tasks: p._count?.tasks ?? 0,
        })),
        [
          { key: "order", header: "#" },
          { key: "id", header: "ID" },
          { key: "name", header: "NAME" },
          { key: "status", header: "STATUS" },
          { key: "tasks", header: "TASKS" },
        ]
      );
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

phaseCommand
  .command("update <id>")
  .description("Update a phase")
  .option("--status <status>", `New status (${VALID_STATUSES.join("|")})`)
  .option("--name <name>", "New name")
  .option("--description <description>", "New description")
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

      if (opts.name !== undefined) updates.name = opts.name;
      if (opts.description !== undefined) updates.description = opts.description;

      if (Object.keys(updates).length === 0) {
        console.error("Error: Provide at least one field to update (--status, --name, --description)");
        process.exit(1);
      }

      const updated = await api.patch(`/api/phases/${id}`, updates);

      if (opts.json) {
        printJson(updated);
      } else {
        process.stdout.write(`Updated phase ${id.slice(0, 8)} '${updated.name}'\n`);
        if (updates.status) {
          process.stdout.write(`  Status: ${updated.status}\n`);
        }
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

phaseCommand
  .command("add <plan-id>")
  .description("Add a phase to a plan")
  .requiredOption("--name <name>", "Phase name")
  .requiredOption("--order <n>", "Phase order (positive integer)", parseInt)
  .option("--description <description>", "Phase description")
  .option("--json", "Output as JSON")
  .action(async (planId, opts) => {
    try {
      if (!Number.isInteger(opts.order) || opts.order < 1) {
        console.error("Error: --order must be a positive integer");
        process.exit(1);
      }

      const phase = await api.post(`/api/plans/${planId}/phases`, {
        name: opts.name,
        order: opts.order,
        ...(opts.description ? { description: opts.description } : {}),
      });

      if (opts.json) {
        printJson(phase);
      } else {
        process.stdout.write(
          `Added phase ${phase.order} '${phase.name}' to plan ${planId.slice(0, 8)} (${phase.id})\n`
        );
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

module.exports = phaseCommand;
