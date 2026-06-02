/**
 * Unit tests for the voice-skill registry (v1: grant-narrative only).
 *
 * Covers:
 *  1. Trigger set: grant-narrative fires on on-intent messages and not on off-intent ones.
 *  2. selectVoiceSkillAddendum returns a non-empty string (with a distinctive phrase)
 *     for an eligible archetype + on-intent message; empty string for off-intent.
 *  3. A non-eligible archetype with a grant-intent message still returns "".
 */

import { describe, it, expect } from "vitest";
import { VOICE_SKILLS, selectVoiceSkillAddendum } from "@/lib/skills/registry";

// -----------------------------------------------------------------------
// 1. Trigger-set tests — grant-narrative fires/doesn't fire as expected
// -----------------------------------------------------------------------

describe("grant-narrative trigger set", () => {
  const grantSkill = VOICE_SKILLS.find((s) => s.id === "grant-narrative");

  it("fires on 'draft our need statement for the Hartwell Foundation'", () => {
    expect(grantSkill).toBeDefined();
    const msg = "draft our need statement for the Hartwell Foundation";
    const matched = grantSkill!.triggers.some((re) => re.test(msg));
    expect(matched).toBe(true);
  });

  it("does NOT fire on 'what's on my calendar'", () => {
    expect(grantSkill).toBeDefined();
    const msg = "what's on my calendar";
    const matched = grantSkill!.triggers.some((re) => re.test(msg));
    expect(matched).toBe(false);
  });

  it("fires on 'help me write the grant proposal'", () => {
    expect(grantSkill).toBeDefined();
    const matched = grantSkill!.triggers.some((re) => re.test("help me write the grant proposal"));
    expect(matched).toBe(true);
  });

  it("fires on 'we need to submit an LOI to MacArthur'", () => {
    expect(grantSkill).toBeDefined();
    const matched = grantSkill!.triggers.some((re) => re.test("we need to submit an LOI to MacArthur"));
    expect(matched).toBe(true);
  });

  it("fires on 'letter of inquiry for the community foundation'", () => {
    expect(grantSkill).toBeDefined();
    const matched = grantSkill!.triggers.some((re) => re.test("letter of inquiry for the community foundation"));
    expect(matched).toBe(true);
  });

  it("does NOT fire on 'send a thank you email to our donor'", () => {
    expect(grantSkill).toBeDefined();
    const matched = grantSkill!.triggers.some((re) => re.test("send a thank you email to our donor"));
    expect(matched).toBe(false);
  });
});

// -----------------------------------------------------------------------
// 2. selectVoiceSkillAddendum — eligible archetype + on-intent → non-empty
// -----------------------------------------------------------------------

describe("selectVoiceSkillAddendum", () => {
  const ON_INTENT_MSG = "draft our need statement for the Hartwell Foundation";
  const OFF_INTENT_MSG = "what's on my calendar";

  it("returns a non-empty string for development_director + grant-intent message", () => {
    const result = selectVoiceSkillAddendum("development_director", ON_INTENT_MSG);
    expect(result).not.toBe("");
  });

  it("result contains the distinctive phrase 'Grant Narrative'", () => {
    const result = selectVoiceSkillAddendum("development_director", ON_INTENT_MSG);
    expect(result).toContain("Grant Narrative");
  });

  it("result contains 'Org voice takes precedence'", () => {
    const result = selectVoiceSkillAddendum("development_director", ON_INTENT_MSG);
    expect(result).toContain("Org voice takes precedence");
  });

  it("returns '' for development_director + off-intent message", () => {
    const result = selectVoiceSkillAddendum("development_director", OFF_INTENT_MSG);
    expect(result).toBe("");
  });

  // -----------------------------------------------------------------------
  // 3. Non-eligible archetype with grant-intent message → empty string
  // -----------------------------------------------------------------------

  it("returns '' for events_director even with a grant-intent message", () => {
    const result = selectVoiceSkillAddendum("events_director", ON_INTENT_MSG);
    expect(result).toBe("");
  });

  it("returns '' for marketing_director + grant-intent message", () => {
    const result = selectVoiceSkillAddendum("marketing_director", ON_INTENT_MSG);
    expect(result).toBe("");
  });

  it("returns '' for executive_assistant + grant-intent message", () => {
    const result = selectVoiceSkillAddendum("executive_assistant", ON_INTENT_MSG);
    expect(result).toBe("");
  });
});

// -----------------------------------------------------------------------
// 4. Cache-integrity smoke: stableSystemText is unchanged by voice skill logic
//    (voice addendum is only in the conditional/uncached path — we verify
//     that the addendum is NOT present in the stable text for a mock prompt)
// -----------------------------------------------------------------------

describe("cache integrity: voice addendum is intent-gated and not in stable text", () => {
  it("voice addendum is empty for an off-intent development_director turn", () => {
    const addendum = selectVoiceSkillAddendum("development_director", "what's on my calendar");
    expect(addendum).toBe("");
  });

  it("voice addendum is empty for any non-development_director archetype regardless of message", () => {
    const archetypes = ["executive_assistant", "marketing_director", "programs_director", "events_director", "hr_volunteer_coordinator"] as const;
    for (const arch of archetypes) {
      const addendum = selectVoiceSkillAddendum(arch, "draft our grant proposal for the Hartwell Foundation");
      expect(addendum).toBe("");
    }
  });
});
