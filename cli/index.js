#!/usr/bin/env node

const { program } = require("commander");
const projectCommand = require("./commands/project");
const worktreeCommand = require("./commands/worktree");
const statusCommand = require("./commands/status");

program
  .name("sm")
  .description("Status Manager CLI — track projects and worktrees")
  .version("0.1.0");

program.addCommand(projectCommand);
program.addCommand(worktreeCommand);
program.addCommand(statusCommand);

program.parseAsync(process.argv).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
