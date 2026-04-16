/**
 * Parser for the markdown plan format produced by /prd-to-plan.
 *
 * Format:
 *
 * # Plan: <Title>
 *
 * > Source PRD: <path>
 *
 * ## Architectural decisions
 *
 * <free text>
 *
 * ---
 *
 * ## Phase 1: <Phase Name>
 * **Status**: pending
 *
 * **User stories**: <text>
 *
 * ### What to build
 * <description text>
 *
 * ### Acceptance criteria
 * - [ ] Criterion 1
 *
 * ---
 */

export interface ParsedCriterion {
  text: string;
  checked: boolean;
  order: number;
}

export interface ParsedTask {
  order: number;
  subject: string;
  description: string | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  criteria: ParsedCriterion[];
}

export interface ParsedPhase {
  order: number;
  name: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
  description: string | null;
  acceptanceCriteria: string | null;
  tasks: ParsedTask[];
}

export interface ParsedPlan {
  title: string;
  architecturalNotes: string | null;
  phases: ParsedPhase[];
}

const PHASE_STATUS_MAP: Record<string, ParsedPhase["status"]> = {
  pending: "PENDING",
  in_progress: "IN_PROGRESS",
  "in progress": "IN_PROGRESS",
  completed: "COMPLETED",
  complete: "COMPLETED",
  skipped: "SKIPPED",
  skip: "SKIPPED",
};

const TASK_STATUS_MAP: Record<string, ParsedTask["status"]> = {
  pending: "PENDING",
  in_progress: "IN_PROGRESS",
  "in progress": "IN_PROGRESS",
  completed: "COMPLETED",
  complete: "COMPLETED",
  failed: "FAILED",
  fail: "FAILED",
};

function parsePhaseStatus(raw: string): ParsedPhase["status"] {
  const normalized = raw.trim().toLowerCase();
  return PHASE_STATUS_MAP[normalized] ?? "PENDING";
}

function parseTaskStatus(raw: string): ParsedTask["status"] {
  const normalized = raw.trim().toLowerCase();
  return TASK_STATUS_MAP[normalized] ?? "PENDING";
}

/**
 * Parse a checkbox list into an array of ParsedCriterion.
 * Recognises `- [ ] text` (unchecked) and `- [x] text` / `- [X] text` (checked).
 */
function parseCriteriaList(text: string): ParsedCriterion[] {
  const criteria: ParsedCriterion[] = [];
  const lines = text.split("\n");
  let order = 1;
  for (const line of lines) {
    const match = /^-\s+\[([ xX])\]\s+(.+)$/.exec(line.trim());
    if (match) {
      criteria.push({
        text: match[2].trim(),
        checked: match[1].toLowerCase() === "x",
        order: order++,
      });
    }
  }
  return criteria;
}

/**
 * Parse the `#### Tasks` block of a phase section into an array of ParsedTask.
 *
 * Each task entry starts with a numbered list item:
 *   1. **Task subject**
 *      Optional description lines.
 *
 *      #### Acceptance criteria
 *      - [ ] criterion
 */
function parseTasks(tasksBlock: string): ParsedTask[] {
  if (!tasksBlock.trim()) return [];

  // Split on numbered task entries: `\n1. `, `\n2. `, etc.
  // We keep the delimiter so each chunk begins with `<n>. `.
  const taskChunks = tasksBlock
    .split(/\n(?=\d+\.\s)/)
    .map((c) => c.trim())
    .filter(Boolean);

  const tasks: ParsedTask[] = [];

  for (const chunk of taskChunks) {
    // First line: `<order>. **Subject**`
    const firstLineMatch = /^(\d+)\.\s+\*\*(.+?)\*\*/.exec(chunk);
    if (!firstLineMatch) continue;

    const order = parseInt(firstLineMatch[1], 10);
    const subject = firstLineMatch[2].trim();

    // Optional status line: `   **Status**: <value>` (may be indented)
    let status: ParsedTask["status"] = "PENDING";
    const statusMatch = /^\s*\*\*Status\*\*:\s*(.+)/im.exec(chunk);
    if (statusMatch) {
      status = parseTaskStatus(statusMatch[1]);
    }

    // Extract `#### Acceptance criteria` block — lines may be indented with spaces.
    // This block is always the last section in a task chunk, so capture greedily to end.
    const acMatch = /####\s+Acceptance criteria\s*\n([\s\S]*)/i.exec(chunk);
    const criteria = acMatch ? parseCriteriaList(acMatch[1]) : [];

    // Description: everything after the first line, before `#### Acceptance criteria`
    // and before the `**Status**` line, stripped of blank lines at start/end.
    const firstLineEnd = chunk.indexOf("\n");
    let descriptionBlock =
      firstLineEnd !== -1 ? chunk.slice(firstLineEnd + 1) : "";

    // Remove status line from description block
    descriptionBlock = descriptionBlock.replace(/\*\*Status\*\*:\s*.+\n?/i, "");

    // Remove `#### Acceptance criteria` block and everything after it
    const acBlockStart = descriptionBlock.search(/####\s+Acceptance criteria/i);
    if (acBlockStart !== -1) {
      descriptionBlock = descriptionBlock.slice(0, acBlockStart);
    }

    const description = descriptionBlock.trim() || null;

    tasks.push({ order, subject, description, status, criteria });
  }

  tasks.sort((a, b) => a.order - b.order);
  return tasks;
}

/**
 * Split markdown into top-level sections delimited by `---` horizontal rules.
 * The first section (before any `---`) is the preamble.
 */
function splitBySeparator(text: string): string[] {
  return text.split(/\n---+\n/);
}

/**
 * Extract text from a named `### Subsection` inside a phase block.
 * Stops at the next `###`-or-higher heading OR at a `#### Tasks` heading
 * (which is a sibling-level section, not a child of `### Acceptance criteria`).
 * Returns the raw text content (trimmed), or null if the section is absent.
 */
function extractSubsection(text: string, heading: string): string | null {
  // Stop at: next `###` heading, a `#### Tasks` heading, or end of string.
  const re = new RegExp(
    `###\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n###|\\n####\\s+Tasks|$)`,
    "i"
  );
  const match = re.exec(text);
  if (!match) return null;
  const content = match[1].trim();
  return content.length > 0 ? content : null;
}

/**
 * Extract the content of the `#### Tasks` block from a phase section.
 * Returns the raw text content (trimmed), or null if absent.
 */
function extractTasksBlock(text: string): string | null {
  // `#### Tasks` appears after all `###` subsections; capture until end of section.
  const re = /####\s+Tasks\s*\n([\s\S]*?)$/i;
  const match = re.exec(text);
  if (!match) return null;
  const content = match[1].trim();
  return content.length > 0 ? content : null;
}

export function parsePlan(markdown: string): ParsedPlan {
  const sections = splitBySeparator(markdown);

  // ── Preamble (first section, before first ---) ───────────────────────────
  const preamble = sections[0] ?? "";

  // Extract plan title: `# Plan: <Title>` or first `# <Title>`
  let title = "Untitled Plan";
  const titleMatch = /^#\s+(?:Plan:\s+)?(.+)$/m.exec(preamble);
  if (titleMatch) {
    title = titleMatch[1].trim();
  }

  // Extract architectural notes from `## Architectural decisions` section
  let architecturalNotes: string | null = null;
  const archMatch = /^##\s+Architectural\s+decisions?\s*\n([\s\S]*?)(?=\n##|\n---|$)/im.exec(
    preamble
  );
  if (archMatch) {
    const content = archMatch[1].trim();
    architecturalNotes = content.length > 0 ? content : null;
  }

  // ── Phase sections ────────────────────────────────────────────────────────
  const phases: ParsedPhase[] = [];
  const phaseHeadingRe = /^##\s+Phase\s+(\d+):\s+(.+)$/m;

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i].trim();
    if (!section) continue;

    const headingMatch = phaseHeadingRe.exec(section);
    if (!headingMatch) continue;

    const order = parseInt(headingMatch[1], 10);
    const name = headingMatch[2].trim();

    // Scope phase-level metadata matches to the header block only
    const headerEnd = section.search(/\n###|\n####/);
    const header = headerEnd !== -1 ? section.slice(0, headerEnd) : section;

    // Status: **Status**: <value>
    let status: ParsedPhase["status"] = "PENDING";
    const statusMatch = /\*\*Status\*\*:\s*(.+)/i.exec(header);
    if (statusMatch) {
      status = parsePhaseStatus(statusMatch[1]);
    }

    // User stories: **User stories**: <single-line text>
    const userStoriesMatch = /\*\*User stories\*\*:\s*(.+)/i.exec(header);

    // Description: combine "What to build" with user stories
    const whatToBuild = extractSubsection(section, "What to build");
    const descParts: string[] = [];
    if (userStoriesMatch) {
      descParts.push(`**User stories**: ${userStoriesMatch[1].trim()}`);
    }
    if (whatToBuild) {
      descParts.push(whatToBuild);
    }
    const description = descParts.length > 0 ? descParts.join("\n\n") : null;

    // Acceptance criteria: raw checkbox list (phase-level, ### heading)
    const acceptanceCriteria = extractSubsection(section, "Acceptance criteria");

    // Tasks: parsed from the `#### Tasks` block
    const tasksBlockText = extractTasksBlock(section);
    const tasks = tasksBlockText ? parseTasks(tasksBlockText) : [];

    phases.push({ order, name, status, description, acceptanceCriteria, tasks });
  }

  // Sort by order to be safe
  phases.sort((a, b) => a.order - b.order);

  return { title, architecturalNotes, phases };
}

/**
 * Render a ParsedPlan (or DB plan shape) back to the canonical markdown format.
 */
export function exportPlanToMarkdown(plan: {
  title: string;
  architecturalNotes?: string | null;
  phases: Array<{
    order: number;
    name: string;
    status: string;
    description?: string | null;
    acceptanceCriteria?: string | null;
    tasks?: Array<{
      order: number;
      subject: string;
      description?: string | null;
      status?: string;
      criteria?: Array<{
        text: string;
        checked: boolean;
        order: number;
      }>;
    }>;
  }>;
}): string {
  const lines: string[] = [];

  lines.push(`# Plan: ${plan.title}`);
  lines.push("");

  if (plan.architecturalNotes) {
    lines.push("## Architectural decisions");
    lines.push("");
    lines.push(plan.architecturalNotes);
    lines.push("");
  }

  const sortedPhases = [...plan.phases].sort((a, b) => a.order - b.order);

  for (const phase of sortedPhases) {
    lines.push("---");
    lines.push("");
    lines.push(`## Phase ${phase.order}: ${phase.name}`);
    lines.push(`**Status**: ${phase.status.toLowerCase()}`);
    lines.push("");

    if (phase.description) {
      // Split user stories from "what to build" if they were stored together
      const userStoriesMatch = /^\*\*User stories\*\*:\s*(.+)/m.exec(
        phase.description
      );
      if (userStoriesMatch) {
        lines.push(`**User stories**: ${userStoriesMatch[1].trim()}`);
        lines.push("");
        // Remainder after user stories line
        const remainder = phase.description
          .replace(/^\*\*User stories\*\*:.+\n?\n?/m, "")
          .trim();
        if (remainder) {
          lines.push("### What to build");
          lines.push(remainder);
          lines.push("");
        }
      } else {
        lines.push("### What to build");
        lines.push(phase.description);
        lines.push("");
      }
    }

    if (phase.acceptanceCriteria) {
      lines.push("### Acceptance criteria");
      lines.push(phase.acceptanceCriteria);
      lines.push("");
    }

    const sortedTasks = phase.tasks
      ? [...phase.tasks].sort((a, b) => a.order - b.order)
      : [];

    if (sortedTasks.length > 0) {
      lines.push("#### Tasks");
      lines.push("");
      for (const task of sortedTasks) {
        lines.push(`${task.order}. **${task.subject}**`);
        lines.push(""); // blank line after subject always
        if (task.description) {
          lines.push(`   ${task.description}`);
          lines.push("");
        }
        if (task.status && task.status !== "PENDING") {
          lines.push(`   **Status**: ${task.status.toLowerCase()}`);
          lines.push("");
        }
        const sortedCriteria = task.criteria
          ? [...task.criteria].sort((a, b) => a.order - b.order)
          : [];
        if (sortedCriteria.length > 0) {
          lines.push("   #### Acceptance criteria");
          for (const c of sortedCriteria) {
            lines.push(`   - [${c.checked ? "x" : " "}] ${c.text}`);
          }
          lines.push("");
        }
      }
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}
