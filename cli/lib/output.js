/**
 * Output helpers.
 * json(data) — print as JSON if --json flag is active, otherwise caller handles it.
 * table(rows, columns) — print an aligned plain-text table.
 */

function printJson(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

/**
 * Print a simple aligned table.
 * @param {Record<string,string>[]} rows
 * @param {{ key: string; header: string }[]} columns
 */
function printTable(rows, columns) {
  if (rows.length === 0) {
    process.stdout.write("(none)\n");
    return;
  }

  // Compute column widths
  const widths = columns.map((col) =>
    Math.max(col.header.length, ...rows.map((r) => String(r[col.key] ?? "").length))
  );

  const line = (row) =>
    columns.map((col, i) => String(row[col.key] ?? "").padEnd(widths[i])).join("  ");

  process.stdout.write(line(Object.fromEntries(columns.map((c) => [c.key, c.header]))) + "\n");
  process.stdout.write(widths.map((w) => "─".repeat(w)).join("  ") + "\n");
  rows.forEach((row) => process.stdout.write(line(row) + "\n"));
}

module.exports = { printJson, printTable };
