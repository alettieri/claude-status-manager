import { describe, it, expect } from "vitest";
import { parsePlan, exportPlanToMarkdown } from "@/lib/plan-parser";

// ---------------------------------------------------------------------------
// Sample markdown fixtures
// ---------------------------------------------------------------------------

const FULL_MARKDOWN = `# Plan: My Implementation Plan

## Architectural decisions

Use REST API with Express. Store data in PostgreSQL.
Keep it simple.

---

## Phase 1: Foundation
**Status**: complete

**User stories**: As a developer, I can bootstrap the project.

### What to build
Set up the repository structure and initial dependencies.

### Acceptance criteria
- [x] Repo initialized
- [x] CI passing

---

## Phase 2: Core Features
**Status**: in_progress

### What to build
Implement the primary business logic.

### Acceptance criteria
- [x] Feature A working
- [ ] Feature B working

---

## Phase 3: Cleanup
**Status**: pending

`;

const MINIMAL_MARKDOWN = `# Plan: Minimal Plan

---

## Phase 1: Only Phase
**Status**: pending

`;

// ---------------------------------------------------------------------------
// parsePlan — title extraction
// ---------------------------------------------------------------------------

describe("parsePlan — title", () => {
  it("extracts title from '# Plan: <title>' heading", () => {
    const result = parsePlan(FULL_MARKDOWN);
    expect(result.title).toBe("My Implementation Plan");
  });

  it("extracts title from a plain '# <title>' heading without 'Plan:' prefix", () => {
    const markdown = `# Just A Title\n\n---\n\n## Phase 1: First\n**Status**: pending\n`;
    const result = parsePlan(markdown);
    expect(result.title).toBe("Just A Title");
  });

  it("falls back to 'Untitled Plan' when there is no heading", () => {
    const result = parsePlan("No heading here.\n\n---\n\n## Phase 1: First\n**Status**: pending\n");
    expect(result.title).toBe("Untitled Plan");
  });
});

// ---------------------------------------------------------------------------
// parsePlan — architectural notes
// ---------------------------------------------------------------------------

describe("parsePlan — architecturalNotes", () => {
  it("extracts content under '## Architectural decisions' section", () => {
    const result = parsePlan(FULL_MARKDOWN);
    expect(result.architecturalNotes).toContain("Use REST API with Express");
    expect(result.architecturalNotes).toContain("PostgreSQL");
  });

  it("returns null when the architectural decisions section is absent", () => {
    const result = parsePlan(MINIMAL_MARKDOWN);
    expect(result.architecturalNotes).toBeNull();
  });

  it("returns null when the architectural decisions section is present but empty", () => {
    const markdown = `# Plan: Empty Arch\n\n## Architectural decisions\n\n---\n\n## Phase 1: P\n**Status**: pending\n`;
    const result = parsePlan(markdown);
    expect(result.architecturalNotes).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parsePlan — phases
// ---------------------------------------------------------------------------

describe("parsePlan — phases", () => {
  it("parses multiple phases with correct order and name", () => {
    const result = parsePlan(FULL_MARKDOWN);
    expect(result.phases).toHaveLength(3);
    expect(result.phases[0]).toMatchObject({ order: 1, name: "Foundation" });
    expect(result.phases[1]).toMatchObject({ order: 2, name: "Core Features" });
    expect(result.phases[2]).toMatchObject({ order: 3, name: "Cleanup" });
  });

  it("returns an empty phases array when there are no phase sections", () => {
    const result = parsePlan("# Plan: No Phases\n\n## Architectural decisions\n\nSome notes.\n");
    expect(result.phases).toHaveLength(0);
  });

  it("sorts phases by order even when sections appear out of order in the source", () => {
    const markdown = `# Plan: Shuffled

---

## Phase 3: Third
**Status**: pending

---

## Phase 1: First
**Status**: pending

---

## Phase 2: Second
**Status**: pending

`;
    const result = parsePlan(markdown);
    expect(result.phases.map((p) => p.order)).toEqual([1, 2, 3]);
    expect(result.phases.map((p) => p.name)).toEqual(["First", "Second", "Third"]);
  });
});

// ---------------------------------------------------------------------------
// parsePlan — status mapping
// ---------------------------------------------------------------------------

describe("parsePlan — status mapping", () => {
  it("maps 'complete' to COMPLETED", () => {
    const result = parsePlan(FULL_MARKDOWN);
    expect(result.phases[0].status).toBe("COMPLETED");
  });

  it("maps 'in_progress' (underscore) to IN_PROGRESS", () => {
    const result = parsePlan(FULL_MARKDOWN);
    expect(result.phases[1].status).toBe("IN_PROGRESS");
  });

  it("maps 'pending' to PENDING", () => {
    const result = parsePlan(FULL_MARKDOWN);
    expect(result.phases[2].status).toBe("PENDING");
  });

  it("maps 'completed' to COMPLETED", () => {
    const markdown = `# Plan: T\n\n---\n\n## Phase 1: P\n**Status**: completed\n`;
    const result = parsePlan(markdown);
    expect(result.phases[0].status).toBe("COMPLETED");
  });

  it("maps 'skipped' to SKIPPED", () => {
    const markdown = `# Plan: T\n\n---\n\n## Phase 1: P\n**Status**: skipped\n`;
    const result = parsePlan(markdown);
    expect(result.phases[0].status).toBe("SKIPPED");
  });

  it("maps 'in progress' (with space) to IN_PROGRESS", () => {
    const markdown = `# Plan: T\n\n---\n\n## Phase 1: P\n**Status**: in progress\n`;
    const result = parsePlan(markdown);
    expect(result.phases[0].status).toBe("IN_PROGRESS");
  });

  it("defaults to PENDING for an unrecognized status", () => {
    const markdown = `# Plan: T\n\n---\n\n## Phase 1: P\n**Status**: unknown_value\n`;
    const result = parsePlan(markdown);
    expect(result.phases[0].status).toBe("PENDING");
  });

  it("defaults to PENDING when no status line is present", () => {
    const markdown = `# Plan: T\n\n---\n\n## Phase 1: P\n\nNo status here.\n`;
    const result = parsePlan(markdown);
    expect(result.phases[0].status).toBe("PENDING");
  });
});

// ---------------------------------------------------------------------------
// parsePlan — description (What to build + user stories)
// ---------------------------------------------------------------------------

describe("parsePlan — description", () => {
  it("extracts '### What to build' section as description", () => {
    const result = parsePlan(FULL_MARKDOWN);
    expect(result.phases[0].description).toContain("Set up the repository structure");
  });

  it("prepends user stories to the description when present", () => {
    const result = parsePlan(FULL_MARKDOWN);
    expect(result.phases[0].description).toContain("**User stories**");
    expect(result.phases[0].description).toContain("bootstrap the project");
  });

  it("returns null description when neither user stories nor What to build are present", () => {
    const result = parsePlan(FULL_MARKDOWN);
    // Phase 3 has no description sections
    expect(result.phases[2].description).toBeNull();
  });

  it("returns description without user stories prefix when only What to build is present", () => {
    const result = parsePlan(FULL_MARKDOWN);
    // Phase 2 has no user stories line
    expect(result.phases[1].description).not.toContain("**User stories**");
    expect(result.phases[1].description).toContain("primary business logic");
  });
});

// ---------------------------------------------------------------------------
// parsePlan — acceptance criteria
// ---------------------------------------------------------------------------

describe("parsePlan — acceptanceCriteria", () => {
  it("extracts the '### Acceptance criteria' section", () => {
    const result = parsePlan(FULL_MARKDOWN);
    expect(result.phases[0].acceptanceCriteria).toContain("Repo initialized");
    expect(result.phases[0].acceptanceCriteria).toContain("CI passing");
  });

  it("returns null when acceptance criteria section is absent", () => {
    const result = parsePlan(FULL_MARKDOWN);
    // Phase 3 has no acceptance criteria
    expect(result.phases[2].acceptanceCriteria).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// exportPlanToMarkdown
// ---------------------------------------------------------------------------

describe("exportPlanToMarkdown", () => {
  it("includes the plan title in a '# Plan:' heading", () => {
    const markdown = exportPlanToMarkdown({
      title: "My Plan",
      architecturalNotes: null,
      phases: [],
    });
    expect(markdown).toContain("# Plan: My Plan");
  });

  it("includes architectural notes when present", () => {
    const markdown = exportPlanToMarkdown({
      title: "T",
      architecturalNotes: "Use microservices.",
      phases: [],
    });
    expect(markdown).toContain("## Architectural decisions");
    expect(markdown).toContain("Use microservices.");
  });

  it("omits the architectural decisions section when notes are null", () => {
    const markdown = exportPlanToMarkdown({
      title: "T",
      architecturalNotes: null,
      phases: [],
    });
    expect(markdown).not.toContain("Architectural decisions");
  });

  it("includes phase names and status in the output", () => {
    const markdown = exportPlanToMarkdown({
      title: "T",
      architecturalNotes: null,
      phases: [
        { order: 1, name: "Alpha", status: "COMPLETED" },
        { order: 2, name: "Beta", status: "PENDING" },
      ],
    });
    expect(markdown).toContain("## Phase 1: Alpha");
    expect(markdown).toContain("**Status**: completed");
    expect(markdown).toContain("## Phase 2: Beta");
    expect(markdown).toContain("**Status**: pending");
  });

  it("includes phase description in a '### What to build' section", () => {
    const markdown = exportPlanToMarkdown({
      title: "T",
      architecturalNotes: null,
      phases: [
        {
          order: 1,
          name: "Alpha",
          status: "PENDING",
          description: "Build the widget.",
        },
      ],
    });
    expect(markdown).toContain("### What to build");
    expect(markdown).toContain("Build the widget.");
  });

  it("includes acceptance criteria in a '### Acceptance criteria' section", () => {
    const markdown = exportPlanToMarkdown({
      title: "T",
      architecturalNotes: null,
      phases: [
        {
          order: 1,
          name: "Alpha",
          status: "PENDING",
          acceptanceCriteria: "- [ ] Widget works",
        },
      ],
    });
    expect(markdown).toContain("### Acceptance criteria");
    expect(markdown).toContain("- [ ] Widget works");
  });

  it("round-trips with parsePlan: export then re-parse gives the same data", () => {
    const original = parsePlan(FULL_MARKDOWN);
    const exported = exportPlanToMarkdown(original);
    const roundTripped = parsePlan(exported);

    expect(roundTripped.title).toBe(original.title);
    expect(roundTripped.architecturalNotes).toBe(original.architecturalNotes);
    expect(roundTripped.phases).toHaveLength(original.phases.length);

    for (let i = 0; i < original.phases.length; i++) {
      expect(roundTripped.phases[i].order).toBe(original.phases[i].order);
      expect(roundTripped.phases[i].name).toBe(original.phases[i].name);
      expect(roundTripped.phases[i].status).toBe(original.phases[i].status);
    }
  });

  it("sorts phases by order regardless of the input array order", () => {
    const markdown = exportPlanToMarkdown({
      title: "T",
      architecturalNotes: null,
      phases: [
        { order: 3, name: "Third", status: "PENDING" },
        { order: 1, name: "First", status: "PENDING" },
        { order: 2, name: "Second", status: "PENDING" },
      ],
    });
    const firstPhaseIndex = markdown.indexOf("## Phase 1: First");
    const secondPhaseIndex = markdown.indexOf("## Phase 2: Second");
    const thirdPhaseIndex = markdown.indexOf("## Phase 3: Third");
    expect(firstPhaseIndex).toBeLessThan(secondPhaseIndex);
    expect(secondPhaseIndex).toBeLessThan(thirdPhaseIndex);
  });
});
