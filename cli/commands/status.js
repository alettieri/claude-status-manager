const { Command } = require("commander");
const { api } = require("../lib/api");
const { printJson } = require("../lib/output");

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
    process.stdout.write(`\n  Plan: ${detail.plan.title}  [${detail.plan.status}]\n`);
  }

  process.stdout.write("\n");
}

module.exports = statusCommand;
