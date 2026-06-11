/**
 * Byte-provenance test — skill-sources hardening 1/2.
 *
 * For each of the 9 voice skills, verifies that the addendum constant embedded
 * in registry.ts is byte-for-byte identical to the corresponding source file's
 * body (everything below the YAML frontmatter, CRLF-normalised, trimmed).
 *
 * Source files live in ../sources/ (authored by Minervamon; committed 2026-06-10).
 * Grant-section trio (logic-model, evaluation-plan, budget-narrative) were
 * byte-verified manually by Lopmon on 2026-06-10 before this automated test existed.
 *
 * Comparison rules:
 *   - Normalise CRLF → LF on both sides.
 *   - Trim leading/trailing whitespace of the whole body on both sides.
 *   - Import the actual VOICE_SKILLS registry (no TS-text parsing) — values are
 *     already unescaped JavaScript strings at runtime, no escaping issues.
 *   - Map skill id → source filename explicitly (see SKILL_TO_FILE below).
 *
 * If a skill diverges: the test is marked todo/skip with a comment describing
 * the first divergence point. Do NOT modify either side to force a pass.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { VOICE_SKILLS } from "@/lib/skills/registry";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a path relative to this test file's __tests__ directory. */
const fromTests = (...parts: string[]) =>
  path.resolve(__dirname, ...parts);

/** Read a skill source file and return its body (frontmatter stripped, normalised). */
function readSourceBody(filename: string): string {
  const filePath = fromTests("..", "sources", filename);
  const raw = fs.readFileSync(filePath, "utf-8");
  // Normalise CRLF → LF
  const normalised = raw.replace(/\r\n/g, "\n");
  // Strip YAML frontmatter: file starts with '---', find closing '---' line
  if (normalised.startsWith("---")) {
    const endFm = normalised.indexOf("\n---", 3);
    if (endFm !== -1) {
      return normalised.slice(endFm + 4).trim();
    }
  }
  return normalised.trim();
}

/** Normalise an addendum string for comparison (CRLF → LF, trim). */
function normalise(s: string): string {
  return s.replace(/\r\n/g, "\n").trim();
}

// ---------------------------------------------------------------------------
// Mapping: skill id → source filename
// ---------------------------------------------------------------------------

const SKILL_TO_FILE: Record<string, string> = {
  "donor-voice":            "donor-voice.md",
  "board-comms":            "board-comms.md",
  "programs-director":      "programs-director.md",
  "events-director":        "events-director.md",
  "volunteer-coordinator":  "volunteer-coordinator.md",
  "grant-narrative":        "grant-narrative.md",
  "logic-model":            "logic-model.md",
  "evaluation-plan":        "evaluation-plan.md",
  "budget-narrative":       "budget-narrative.md",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("skill-provenance: embed byte-equality with source files", () => {
  // Verify every entry in SKILL_TO_FILE is present in VOICE_SKILLS
  it("all 9 skills are present in the VOICE_SKILLS registry", () => {
    const ids = new Set(VOICE_SKILLS.map((s) => s.id));
    for (const skillId of Object.keys(SKILL_TO_FILE)) {
      expect(ids.has(skillId), `skill '${skillId}' missing from VOICE_SKILLS`).toBe(true);
    }
    expect(Object.keys(SKILL_TO_FILE)).toHaveLength(9);
  });

  // ---------------------------------------------------------------------------
  // Per-skill provenance checks
  // Grant-section trio (logic-model, evaluation-plan, budget-narrative) were
  // byte-verified manually by Lopmon on 2026-06-10 before this test existed.
  // All 9 were confirmed MATCH by automated comparison on 2026-06-10.
  // ---------------------------------------------------------------------------

  it("donor-voice: addendum matches source body", () => {
    const skill = VOICE_SKILLS.find((s) => s.id === "donor-voice");
    expect(skill).toBeDefined();
    const embed = normalise(skill!.addendum);
    const source = readSourceBody(SKILL_TO_FILE["donor-voice"]);
    expect(embed).toBe(source);
  });

  it("board-comms: addendum matches source body", () => {
    const skill = VOICE_SKILLS.find((s) => s.id === "board-comms");
    expect(skill).toBeDefined();
    const embed = normalise(skill!.addendum);
    const source = readSourceBody(SKILL_TO_FILE["board-comms"]);
    expect(embed).toBe(source);
  });

  it("programs-director: addendum matches source body", () => {
    const skill = VOICE_SKILLS.find((s) => s.id === "programs-director");
    expect(skill).toBeDefined();
    const embed = normalise(skill!.addendum);
    const source = readSourceBody(SKILL_TO_FILE["programs-director"]);
    expect(embed).toBe(source);
  });

  it("events-director: addendum matches source body", () => {
    const skill = VOICE_SKILLS.find((s) => s.id === "events-director");
    expect(skill).toBeDefined();
    const embed = normalise(skill!.addendum);
    const source = readSourceBody(SKILL_TO_FILE["events-director"]);
    expect(embed).toBe(source);
  });

  it("volunteer-coordinator: addendum matches source body", () => {
    const skill = VOICE_SKILLS.find((s) => s.id === "volunteer-coordinator");
    expect(skill).toBeDefined();
    const embed = normalise(skill!.addendum);
    const source = readSourceBody(SKILL_TO_FILE["volunteer-coordinator"]);
    expect(embed).toBe(source);
  });

  it("grant-narrative: addendum matches source body (byte-verified 2026-06-10)", () => {
    const skill = VOICE_SKILLS.find((s) => s.id === "grant-narrative");
    expect(skill).toBeDefined();
    const embed = normalise(skill!.addendum);
    const source = readSourceBody(SKILL_TO_FILE["grant-narrative"]);
    expect(embed).toBe(source);
  });

  it("logic-model: addendum matches source body (byte-verified 2026-06-10)", () => {
    const skill = VOICE_SKILLS.find((s) => s.id === "logic-model");
    expect(skill).toBeDefined();
    const embed = normalise(skill!.addendum);
    const source = readSourceBody(SKILL_TO_FILE["logic-model"]);
    expect(embed).toBe(source);
  });

  it("evaluation-plan: addendum matches source body (byte-verified 2026-06-10)", () => {
    const skill = VOICE_SKILLS.find((s) => s.id === "evaluation-plan");
    expect(skill).toBeDefined();
    const embed = normalise(skill!.addendum);
    const source = readSourceBody(SKILL_TO_FILE["evaluation-plan"]);
    expect(embed).toBe(source);
  });

  it("budget-narrative: addendum matches source body (byte-verified 2026-06-10)", () => {
    const skill = VOICE_SKILLS.find((s) => s.id === "budget-narrative");
    expect(skill).toBeDefined();
    const embed = normalise(skill!.addendum);
    const source = readSourceBody(SKILL_TO_FILE["budget-narrative"]);
    expect(embed).toBe(source);
  });
});
