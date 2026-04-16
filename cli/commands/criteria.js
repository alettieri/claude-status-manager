const { Command } = require("commander");
const { api } = require("../lib/api");
const { printJson } = require("../lib/output");

const criteriaCommand = new Command("criteria").description(
  "Manage acceptance criteria"
);

// ─── sm criteria check <id> ───────────────────────────────────────────────────

criteriaCommand
  .command("check <id>")
  .description("Mark an acceptance criterion as checked")
  .option("--json", "Output as JSON")
  .action(async (id, opts) => {
    try {
      const criterion = await api.post(`/api/criteria/${id}/check`, {});

      if (opts.json) {
        printJson(criterion);
        return;
      }

      process.stdout.write(`Checked: ${criterion.text}\n`);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// ─── sm criteria uncheck <id> ─────────────────────────────────────────────────

criteriaCommand
  .command("uncheck <id>")
  .description("Mark an acceptance criterion as unchecked")
  .option("--json", "Output as JSON")
  .action(async (id, opts) => {
    try {
      const criterion = await api.post(`/api/criteria/${id}/uncheck`, {});

      if (opts.json) {
        printJson(criterion);
        return;
      }

      process.stdout.write(`Unchecked: ${criterion.text}\n`);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

module.exports = criteriaCommand;
