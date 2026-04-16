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

export interface ParsedPhase {
  order: number;
  name: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
  description: string | null;
  acceptanceCriteria: string | null;
}

export interface ParsedPlan {
  title: string;
  architecturalNotes: string | null;
  phases: ParsedPhase[];
}

const STATUS_MAP: Record<string, ParsedPhase["status"]> = {
  pending: "PENDING",
  in_progress: "IN_PROGRESS",
  "in progress": "IN_PROGRESS",
  completed: "COMPLETED",
  complete: "COMPLETED",
  skipped: "SKIPPED",
  skip: "SKIPPED",
};

function parseStatus(raw: string): ParsedPhase["status"] {
  const normalized = raw.trim().toLowerCase();
  return STATUS_MAP[normalized] ?? "PENDING";
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
 * Returns the raw text content (trimmed), or null if the section is absent.
 */
function extractSubsection(text: string, heading: string): string | null {
  // Match `### <heading>` (case-insensitive) and capture everything until the
  // next `###`-level heading or end of string.
  const re = new RegExp(
    `###\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n###|$)`,
    "i"
  );
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

    // Status: **Status**: <value>
    let status: ParsedPhase["status"] = "PENDING";
    const statusMatch = /\*\*Status\*\*:\s*(.+)/i.exec(section);
    if (statusMatch) {
      status = parseStatus(statusMatch[1]);
    }

    // User stories: **User stories**: <single-line text>
    const userStoriesMatch = /\*\*User stories\*\*:\s*(.+)/i.exec(section);

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

    // Acceptance criteria: raw checkbox list
    const acceptanceCriteria = extractSubsection(section, "Acceptance criteria");

    phases.push({ order, name, status, description, acceptanceCriteria });
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
  }

  return lines.join("\n").trimEnd() + "\n";
}
