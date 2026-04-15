const { Command } = require("commander");
const { api } = require("../lib/api");
const { printJson, printTable } = require("../lib/output");

const projectCommand = new Command("project").description(
  "Manage projects"
);

projectCommand
  .command("add <name>")
  .description("Register a new project")
  .requiredOption("--path <basePath>", "Absolute path to the project root")
  .option("--description <desc>", "Optional description")
  .option("--json", "Output as JSON")
  .action(async (name, opts) => {
    try {
      const project = await api.post("/api/projects", {
        name,
        basePath: opts.path,
        description: opts.description,
      });
      if (opts.json) {
        printJson(project);
      } else {
        process.stdout.write(`Created project '${project.name}' (${project.id})\n`);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

projectCommand
  .command("list")
  .description("List all projects")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    try {
      const projects = await api.get("/api/projects");
      if (opts.json) {
        printJson(projects);
      } else {
        printTable(
          projects.map((p) => ({
            name: p.name,
            path: p.basePath,
            worktrees: String(p._count?.worktrees ?? 0),
            created: new Date(p.createdAt).toLocaleDateString(),
          })),
          [
            { key: "name", header: "NAME" },
            { key: "worktrees", header: "WORKTREES" },
            { key: "path", header: "PATH" },
            { key: "created", header: "CREATED" },
          ]
        );
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

projectCommand
  .command("remove <name>")
  .description("Remove a project and all associated data")
  .option("--json", "Output as JSON")
  .action(async (name, opts) => {
    try {
      // Find project by name
      const projects = await api.get("/api/projects");
      const project = projects.find((p) => p.name === name);
      if (!project) {
        console.error(`Error: Project '${name}' not found`);
        process.exit(1);
      }
      await api.delete(`/api/projects/${project.id}`);
      if (opts.json) {
        printJson({ deleted: true, name });
      } else {
        process.stdout.write(`Removed project '${name}'\n`);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

module.exports = projectCommand;
