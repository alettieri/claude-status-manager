const { Command } = require("commander");
const { resolve } = require("path");
const { api } = require("../lib/api");
const { printJson, printTable } = require("../lib/output");

const VALID_TYPES = ["SPEC", "PRD"];
const VALID_STATUSES = ["DRAFT", "REVIEW", "APPROVED"];

const artifactCommand = new Command("artifact").description("Manage artifacts (specs and PRDs)");

artifactCommand
  .command("add <worktree>")
  .description("Register an artifact and ingest its file content")
  .requiredOption("--type <type>", `Artifact type (${VALID_TYPES.join("|")})`)
  .requiredOption("--file <path>", "Absolute or relative path to the artifact file")
  .option("--title <title>", "Override the artifact title (defaults to filename)")
  .option("--json", "Output as JSON")
  .action(async (worktreeName, opts) => {
    try {
      const typeUpper = opts.type.toUpperCase();
      if (!VALID_TYPES.includes(typeUpper)) {
        console.error(`Error: Invalid type '${opts.type}'. Must be one of: ${VALID_TYPES.join(", ")}`);
        process.exit(1);
      }

      const worktree = await api.get(`/api/worktrees?name=${encodeURIComponent(worktreeName)}`);

      const artifact = await api.post(`/api/worktrees/${worktree.id}/artifacts`, {
        type: typeUpper,
        filePath: resolve(opts.file),
        ...(opts.title ? { title: opts.title } : {}),
      });

      if (opts.json) {
        printJson(artifact);
      } else {
        process.stdout.write(
          `Registered ${artifact.type} artifact '${artifact.title}' (${artifact.id})\n`
        );
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

artifactCommand
  .command("list <worktree>")
  .description("List registered artifacts for a worktree")
  .option("--json", "Output as JSON")
  .action(async (worktreeName, opts) => {
    try {
      const worktree = await api.get(`/api/worktrees?name=${encodeURIComponent(worktreeName)}`);

      const artifacts = await api.get(`/api/worktrees/${worktree.id}/artifacts`);

      if (opts.json) {
        printJson(artifacts);
      } else {
        if (artifacts.length === 0) {
          process.stdout.write(`No artifacts registered for '${worktreeName}'.\n`);
          process.stdout.write(
            `  Use: sm artifact add ${worktreeName} --type spec --file <path>\n`
          );
          return;
        }
        printTable(
          artifacts.map((a) => ({
            id: a.id.slice(0, 8),
            type: a.type,
            title: a.title,
            status: a.status,
            file: a.filePath,
          })),
          [
            { key: "id", header: "ID" },
            { key: "type", header: "TYPE" },
            { key: "title", header: "TITLE" },
            { key: "status", header: "STATUS" },
            { key: "file", header: "FILE" },
          ]
        );
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

artifactCommand
  .command("status <id> <status>")
  .description(`Set the status of an artifact (${VALID_STATUSES.join("|")})`)
  .option("--json", "Output as JSON")
  .action(async (id, status, opts) => {
    try {
      const statusUpper = status.toUpperCase();
      if (!VALID_STATUSES.includes(statusUpper)) {
        console.error(
          `Error: Invalid status '${status}'. Must be one of: ${VALID_STATUSES.join(", ")}`
        );
        process.exit(1);
      }

      const updated = await api.patch(`/api/artifacts/${id}`, { status: statusUpper });

      if (opts.json) {
        printJson(updated);
      } else {
        process.stdout.write(`Updated artifact ${id.slice(0, 8)} status to ${statusUpper}\n`);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

artifactCommand
  .command("refresh <id>")
  .description("Re-read the file and update the content snapshot in the database")
  .option("--json", "Output as JSON")
  .action(async (id, opts) => {
    try {
      const updated = await api.post(`/api/artifacts/${id}/refresh`, {});

      if (opts.json) {
        printJson(updated);
      } else {
        process.stdout.write(
          `Refreshed content snapshot for artifact ${id.slice(0, 8)} ('${updated.title}')\n`
        );
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

module.exports = artifactCommand;
