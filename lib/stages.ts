import { WorktreeStage } from "@prisma/client";

export const STAGES: WorktreeStage[] = ["IDEA", "SPEC", "PRD", "PLAN", "EXECUTING", "DONE"];

export const STAGE_LABELS: Record<WorktreeStage, string> = {
  IDEA: "Idea",
  SPEC: "Spec",
  PRD: "PRD",
  PLAN: "Plan",
  EXECUTING: "Executing",
  DONE: "Done",
};

export const STAGE_COLORS: Record<WorktreeStage, string> = {
  IDEA: "var(--accent-idea)",
  SPEC: "var(--accent-spec)",
  PRD: "var(--accent-prd)",
  PLAN: "var(--accent-plan)",
  EXECUTING: "var(--accent-executing)",
  DONE: "var(--accent-done)",
};
