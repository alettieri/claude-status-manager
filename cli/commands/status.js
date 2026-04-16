const { Command } = require("commander");
const { api } = require("../lib/api");
const { printJson } = require("../lib/output");

const TASK_STATUS_ICONS = {
  PENDING: "○",
  IN_PROGRESS: "◉",
  COMPLETED: "✓",
  FAILED: "✗",
};

const PHASE_STATUS_ICONS = {
  PENDING: "○",
  IN_PROGRESS: "◉",
  COMPLETED: "✓",
  SKIPPED: "—",
};

const STAGE_ORDER = ["IDEA", "SPEC", "PRD", "PLAN", "EXECUTING", "DONE"];

const statusCommand = new Command("status")
  .description("Show summary of all projects and worktrees")
  .argument("[worktree]", "Show detailed view for one worktree")
  .option("--json", "Output as JSON")
  .action(async (worktreeName, opts) => {
    try {
      if (worktreeName) {
        await showWorktreeDetail(worktreeName, opts.json);
      } else {
        await showOverview(opts.json);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

async function showOverview(asJson) {
  const projects = await api.get("/api/projects");

  if (projects.length === 0) {
    process.stdout.write("No projects registered. Run 'sm project add <name> --path <path>'\n");
    return;
  }

  // Fetch all worktrees in parallel
  const projectsWithWorktrees = await Promise.all(
    projects.map(async (project) => ({
      ...project,
      worktrees: await api.get(`/api/projects/${project.id}/worktrees`),
    }))
  );

  if (asJson) {
    printJson(projectsWithWorktrees);
    return;
  }

  for (const project of projectsWithWorktrees) {
    const worktrees = project.worktrees;
    process.stdout.write(`\n${project.name}  ${project.basePath}\n`);
    process.stdout.write("─".repeat(60) + "\n");

    if (worktrees.length === 0) {
      process.stdout.write("  (no worktrees)\n");
      continue;
    }

    // Group by stage
    const byStage = Object.fromEntries(STAGE_ORDER.map((s) => [s, []]));
    worktrees.forEach((w) => byStage[w.stage].push(w));

    // Print a summary line per stage that has worktrees
    STAGE_ORDER.forEach((stage) => {
      const ws = byStage[stage];
      if (ws.length === 0) return;
      ws.forEach((w) => {
        process.stdout.write(
          `  ${stage.padEnd(10)}  ${w.name.padEnd(30)}  ${w.branch}\n`
        );
      });
    });
  }

  process.stdout.write("\n");
}

async function showWorktreeDetail(name, asJson) {
  // Look up worktree by name directly — O(1) instead of scanning all projects
  const worktree = await api.get(`/api/worktrees?name=${encodeURIComponent(name)}`);

  // Fetch full detail (includes project, artifacts, plan)
  const detail = await api.get(`/api/worktrees/${worktree.id}`);

  if (asJson) {
    printJson(detail);
    return;
  }

  process.stdout.write(`\n${detail.name}  [${detail.stage}]\n`);
  process.stdout.write("─".repeat(60) + "\n");
  process.stdout.write(`  Project : ${detail.project.name}\n`);
  process.stdout.write(`  Branch  : ${detail.branch}\n`);
  process.stdout.write(`  Path    : ${detail.path}\n`);

  if (detail.artifacts && detail.artifacts.length > 0) {
    process.stdout.write(`\n  Artifacts:\n`);
    detail.artifacts.forEach((a) => {
      process.stdout.write(`    [${a.type}] ${a.title}  (${a.status})\n`);
    });
  }

  if (detail.plan) {
    const plan = detail.plan;
    process.stdout.write(`\n  Plan: ${plan.title}  [${plan.status}]\n`);

    if (plan.phases && plan.phases.length > 0) {
      // Aggregate totals across the whole plan
      let planTotal = 0;
      let planCompleted = 0;

      for (const phase of plan.phases) {
        const tasks = phase.tasks || [];
        const total = tasks.length;
        const completed = tasks.filter((t) => t.status === "COMPLETED").length;
        const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
        const failed = tasks.filter((t) => t.status === "FAILED").length;

        planTotal += total;
        planCompleted += completed;

        const phaseIcon = PHASE_STATUS_ICONS[phase.status] ?? "?";
        const progressStr =
          total > 0 ? `  ${completed}/${total} tasks` : "  no tasks";

        process.stdout.write(
          `\n    ${phaseIcon} Phase ${phase.order}: ${phase.name}  [${phase.status}]${progressStr}\n`
        );

        // Show individual tasks
        for (const task of tasks) {
          const icon = TASK_STATUS_ICONS[task.status] ?? "?";
          const agentStr = task.agentId ? `  @${task.agentId}` : "";
          const resultStr = task.result ? `  → ${task.result.slice(0, 60)}` : "";
          process.stdout.write(
            `        ${icon} ${task.subject}${agentStr}${resultStr}\n`
          );
        }

        // Surface any failed task count as a warning
        if (failed > 0) {
          process.stdout.write(`        ! ${failed} failed task${failed !== 1 ? "s" : ""}\n`);
        }

        // Surface in-progress count
        if (inProgress > 0) {
          process.stdout.write(
            `        ~ ${inProgress} task${inProgress !== 1 ? "s" : ""} in progress\n`
          );
        }
      }

      if (planTotal > 0) {
        const pct = Math.round((planCompleted / planTotal) * 100);
        process.stdout.write(
          `\n  Progress: ${planCompleted}/${planTotal} tasks completed (${pct}%)\n`
        );
      }
    }
  }

  process.stdout.write("\n");
}

module.exports = statusCommand;
