const { Command } = require("commander");
const { api } = require("../lib/api");
const { printJson, printTable } = require("../lib/output");

const VALID_STAGES = ["IDEA", "SPEC", "PRD", "PLAN", "EXECUTING", "DONE"];

const worktreeCommand = new Command("worktree").description(
  "Manage worktrees"
);

worktreeCommand
  .command("add <name>")
  .description("Register a new worktree")
  .requiredOption("--project <project>", "Project name")
  .requiredOption("--path <path>", "Absolute filesystem path to the worktree")
  .requiredOption("--branch <branch>", "Git branch name")
  .option("--json", "Output as JSON")
  .action(async (name, opts) => {
    try {
      // Resolve project by name
      const projects = await api.get("/api/projects");
      const project = projects.find((p) => p.name === opts.project);
      if (!project) {
        console.error(`Error: Project '${opts.project}' not found. Run 'sm project add' first.`);
        process.exit(1);
      }

      const worktree = await api.post(`/api/projects/${project.id}/worktrees`, {
        name,
        path: opts.path,
        branch: opts.branch,
      });

      if (opts.json) {
        printJson(worktree);
      } else {
        process.stdout.write(
          `Registered worktree '${worktree.name}' in project '${opts.project}' (${worktree.id})\n`
        );
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

worktreeCommand
  .command("list")
  .description("List all worktrees")
  .option("--project <project>", "Filter by project name")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    try {
      let worktrees;

      if (opts.project) {
        const projects = await api.get("/api/projects");
        const project = projects.find((p) => p.name === opts.project);
        if (!project) {
          console.error(`Error: Project '${opts.project}' not found`);
          process.exit(1);
        }
        const rawWorktrees = await api.get(`/api/projects/${project.id}/worktrees`);
        worktrees = rawWorktrees.map((w) => ({ ...w, projectName: project.name }));
      } else {
        // Fetch all projects then their worktrees in parallel
        const projects = await api.get("/api/projects");
        const all = await Promise.all(
          projects.map((p) =>
            api.get(`/api/projects/${p.id}/worktrees`).then((ws) =>
              ws.map((w) => ({ ...w, projectName: p.name }))
            )
          )
        );
        worktrees = all.flat();
      }

      if (opts.json) {
        printJson(worktrees);
      } else {
        printTable(
          worktrees.map((w) => ({
            name: w.name,
            project: w.projectName || opts.project || "",
            stage: w.stage,
            branch: w.branch,
            path: w.path,
          })),
          [
            { key: "name", header: "NAME" },
            { key: "project", header: "PROJECT" },
            { key: "stage", header: "STAGE" },
            { key: "branch", header: "BRANCH" },
            { key: "path", header: "PATH" },
          ]
        );
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

worktreeCommand
  .command("stage <name> <stage>")
  .description(`Set the pipeline stage for a worktree (${VALID_STAGES.join("|")})`)
  .option("--json", "Output as JSON")
  .action(async (name, stage, opts) => {
    try {
      const stageUpper = stage.toUpperCase();
      if (!VALID_STAGES.includes(stageUpper)) {
        console.error(
          `Error: Invalid stage '${stage}'. Must be one of: ${VALID_STAGES.join(", ")}`
        );
        process.exit(1);
      }

      const worktree = await api.get(`/api/worktrees?name=${encodeURIComponent(name)}`);

      const updated = await api.patch(`/api/worktrees/${worktree.id}`, {
        stage: stageUpper,
      });

      if (opts.json) {
        printJson(updated);
      } else {
        process.stdout.write(
          `Updated worktree '${name}' stage to ${stageUpper}\n`
        );
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

worktreeCommand
  .command("remove <name>")
  .description("Unregister a worktree")
  .option("--json", "Output as JSON")
  .action(async (name, opts) => {
    try {
      const worktree = await api.get(`/api/worktrees?name=${encodeURIComponent(name)}`);

      await api.delete(`/api/worktrees/${worktree.id}`);

      if (opts.json) {
        printJson({ deleted: true, name });
      } else {
        process.stdout.write(`Removed worktree '${name}'\n`);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

worktreeCommand
  .command("sync <name>")
  .description(
    "Scan the worktree directory for spec/PRD markdown files, sync artifact records, and auto-advance stage"
  )
  .option("--json", "Output as JSON")
  .action(async (name, opts) => {
    try {
      const worktree = await api.get(`/api/worktrees?name=${encodeURIComponent(name)}`);

      const result = await api.post(`/api/worktrees/${worktree.id}/sync`, {});

      if (opts.json) {
        printJson(result);
      } else {
        process.stdout.write(`Synced artifacts for worktree '${name}':\n`);
        process.stdout.write(`  Created : ${result.created}\n`);
        process.stdout.write(`  Updated : ${result.updated}\n`);
        process.stdout.write(`  Removed : ${result.softDeleted}\n`);
        if (result.stageAdvanced) {
          process.stdout.write(`  Stage   : advanced to ${result.stageAdvanced}\n`);
        }

        if (result.files.created.length > 0) {
          process.stdout.write(`\nNew artifacts:\n`);
          for (const f of result.files.created) {
            process.stdout.write(`  + ${f}\n`);
          }
        }
        if (result.files.softDeleted.length > 0) {
          process.stdout.write(`\nRemoved (file no longer exists):\n`);
          for (const f of result.files.softDeleted) {
            process.stdout.write(`  - ${f}\n`);
          }
        }
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

module.exports = worktreeCommand;
