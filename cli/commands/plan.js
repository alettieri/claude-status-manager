const { Command } = require("commander");
const { resolve } = require("path");
const { api } = require("../lib/api");
const { printJson, printTable } = require("../lib/output");

const PHASE_STATUS_COLORS = {
  PENDING: "",
  IN_PROGRESS: "→",
  COMPLETED: "✓",
  SKIPPED: "~",
};

function formatPhaseStatus(status) {
  const icon = PHASE_STATUS_COLORS[status] ?? "";
  return icon ? `${icon} ${status}` : status;
}

const planCommand = new Command("plan").description("Manage implementation plans");

planCommand
  .command("create <worktree>")
  .description("Create an empty plan for a worktree")
  .requiredOption("--title <title>", "Plan title")
  .option("--description <description>", "Plan description")
  .option("--json", "Output as JSON")
  .action(async (worktreeName, opts) => {
    try {
      const worktree = await api.get(`/api/worktrees?name=${encodeURIComponent(worktreeName)}`);

      const plan = await api.post(`/api/worktrees/${worktree.id}/plan`, {
        title: opts.title,
        ...(opts.description ? { description: opts.description } : {}),
      });

      if (opts.json) {
        printJson(plan);
      } else {
        process.stdout.write(`Created plan '${plan.title}' (${plan.id})\n`);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

planCommand
  .command("show <worktree>")
  .description("Display the full plan with phases for a worktree")
  .option("--json", "Output as JSON")
  .action(async (worktreeName, opts) => {
    try {
      const worktree = await api.get(`/api/worktrees?name=${encodeURIComponent(worktreeName)}`);

      const plan = await api.get(`/api/worktrees/${worktree.id}/plan`);

      if (opts.json) {
        printJson(plan);
        return;
      }

      process.stdout.write(`\nPlan: ${plan.title}\n`);
      process.stdout.write(`Status: ${plan.status}\n`);
      if (plan.description) {
        process.stdout.write(`\n${plan.description}\n`);
      }
      if (plan.architecturalNotes) {
        process.stdout.write(`\nArchitectural decisions:\n${plan.architecturalNotes}\n`);
      }
      process.stdout.write(`\n${plan.phases.length} phase${plan.phases.length !== 1 ? "s" : ""}:\n\n`);

      for (const phase of plan.phases) {
        const taskCount = phase._count?.tasks ?? 0;
        process.stdout.write(
          `  Phase ${phase.order}: ${phase.name}\n`
        );
        process.stdout.write(
          `    Status: ${formatPhaseStatus(phase.status)}  |  Tasks: ${taskCount}\n`
        );
        if (phase.description) {
          const preview = phase.description.length > 120
            ? phase.description.slice(0, 120) + "..."
            : phase.description;
          process.stdout.write(`    ${preview}\n`);
        }
        process.stdout.write("\n");
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

planCommand
  .command("import <worktree>")
  .description("Parse a markdown plan file and create Plan + Phase records")
  .requiredOption("--file <path>", "Path to the markdown plan file")
  .option("--json", "Output as JSON")
  .action(async (worktreeName, opts) => {
    try {
      const worktree = await api.get(`/api/worktrees?name=${encodeURIComponent(worktreeName)}`);

      const plan = await api.post(`/api/worktrees/${worktree.id}/plan/import`, {
        filePath: resolve(opts.file),
      });

      if (opts.json) {
        printJson(plan);
      } else {
        process.stdout.write(`Imported plan '${plan.title}' (${plan.id})\n`);
        process.stdout.write(`  ${plan.phases.length} phase${plan.phases.length !== 1 ? "s" : ""} created\n`);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

planCommand
  .command("export <worktree>")
  .description("Render the DB plan as markdown")
  .option("--json", "Output raw JSON with markdown field")
  .action(async (worktreeName, opts) => {
    try {
      const worktree = await api.get(`/api/worktrees?name=${encodeURIComponent(worktreeName)}`);

      const result = await api.get(`/api/worktrees/${worktree.id}/plan/export`);

      if (opts.json) {
        printJson(result);
      } else {
        process.stdout.write(result.markdown);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

module.exports = planCommand;
