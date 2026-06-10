/**
 * Unit tests for the voice-skill registry.
 *
 * Covers:
 *  1. Trigger set: grant-narrative fires on on-intent messages and not on off-intent ones.
 *     Also verifies tightened triggers for "foundation".
 *     NOTE: "outcomes" and "logic model" triggers migrated to logic-model skill (PRD: grant-section-craft-layers).
 *  2. selectVoiceSkillAddendum returns a non-empty string (with a distinctive phrase)
 *     for an eligible archetype + on-intent message; empty string for off-intent.
 *  3. A non-eligible archetype with a grant-intent message still returns "".
 *  4. donor-voice: fires for marketing_director on donor-intent messages.
 *  5. board-comms: fires for executive_assistant on board-intent messages.
 *  6. Sanity: multi-skill-word message returns exactly ONE addendum (first match wins);
 *     off-intent message returns "".
 * 11. logic-model skill: trigger fires / silent for on-intent / off-intent messages.
 * 12. evaluation-plan skill: trigger fires / silent for on-intent / off-intent messages.
 * 13. budget-narrative skill: trigger fires / silent for on-intent / off-intent messages.
 * 14. Migration regression: "logic model" and "outcomes" messages now select logic-model, NOT grant-narrative.
 * 15. Precedence: mixed grant+section message selects section skill (more-specific-wins).
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

  // --- Tightened "foundation" trigger tests ---

  it("fires on 'the Hartwell Foundation' (proper-noun funder)", () => {
    expect(grantSkill).toBeDefined();
    const matched = grantSkill!.triggers.some((re) => re.test("draft our LOI for the Hartwell Foundation"));
    expect(matched).toBe(true);
  });

  it("fires on 'community foundation' (known funder context)", () => {
    expect(grantSkill).toBeDefined();
    const matched = grantSkill!.triggers.some((re) => re.test("letter of inquiry for the community foundation"));
    expect(matched).toBe(true);
  });

  it("does NOT fire on 'foundation of our plan' (generic English use)", () => {
    expect(grantSkill).toBeDefined();
    const matched = grantSkill!.triggers.some((re) => re.test("this is the foundation of our plan"));
    expect(matched).toBe(false);
  });

  it("does NOT fire on 'the foundation of the program' (generic English use)", () => {
    expect(grantSkill).toBeDefined();
    const matched = grantSkill!.triggers.some((re) => re.test("that's the foundation of the program"));
    expect(matched).toBe(false);
  });

  // --- "outcomes" and "logic model" triggers MIGRATED to logic-model skill ---
  // These triggers were removed from grant-narrative (PRD: grant-section-craft-layers).
  // The migration regression tests in section 14 confirm the new skill now owns these phrases.

  it("still fires on 'report outcomes to the funder' via the \\b(funder)\\b trigger (not the migrated outcomes regex)", () => {
    // NOTE: "we need to report outcomes to the funder" contains "funder" which is a remaining
    // grant-narrative trigger. The outcomes regex was migrated but grant-narrative still
    // matches this via \b(funder|funders)\b. The migration regression tests (section 14)
    // confirm that selectVoiceSkillAddendum picks logic-model first (not grant-narrative)
    // for this message because logic-model also matches and is earlier in the array.
    expect(grantSkill).toBeDefined();
    const matched = grantSkill!.triggers.some((re) => re.test("we need to report outcomes to the funder"));
    expect(matched).toBe(true);
  });

  it("does NOT fire on 'measure our program outcomes' (trigger migrated to logic-model)", () => {
    expect(grantSkill).toBeDefined();
    const matched = grantSkill!.triggers.some((re) => re.test("how do we measure our program outcomes?"));
    expect(matched).toBe(false);
  });

  it("does NOT fire on 'logic model and outcomes' (trigger migrated to logic-model)", () => {
    expect(grantSkill).toBeDefined();
    const matched = grantSkill!.triggers.some((re) => re.test("fill in the logic model and outcomes section"));
    expect(matched).toBe(false);
  });

  it("does NOT fire on 'outcomes data for the report' (trigger migrated to logic-model)", () => {
    expect(grantSkill).toBeDefined();
    const matched = grantSkill!.triggers.some((re) => re.test("pull together our outcomes data for the report"));
    expect(matched).toBe(false);
  });

  it("does NOT fire on 'outcome of the gala' (generic English use)", () => {
    expect(grantSkill).toBeDefined();
    const matched = grantSkill!.triggers.some((re) => re.test("what was the outcome of the gala?"));
    expect(matched).toBe(false);
  });

  it("does NOT fire on 'the final outcome' (generic English use)", () => {
    expect(grantSkill).toBeDefined();
    const matched = grantSkill!.triggers.some((re) => re.test("let's talk about the final outcome"));
    expect(matched).toBe(false);
  });
});

// -----------------------------------------------------------------------
// 2. selectVoiceSkillAddendum — eligible archetype + on-intent → non-empty
// -----------------------------------------------------------------------

describe("selectVoiceSkillAddendum — grant-narrative", () => {
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
// 4. donor-voice trigger set and selectVoiceSkillAddendum
// -----------------------------------------------------------------------

describe("donor-voice trigger set", () => {
  const donorSkill = VOICE_SKILLS.find((s) => s.id === "donor-voice");

  it("fires on 'write a thank-you letter to our major donor'", () => {
    expect(donorSkill).toBeDefined();
    const matched = donorSkill!.triggers.some((re) =>
      re.test("write a thank-you letter to our major donor")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'draft a year-end appeal for our donors'", () => {
    expect(donorSkill).toBeDefined();
    const matched = donorSkill!.triggers.some((re) =>
      re.test("draft a year-end appeal for our donors")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'write an impact report for donors'", () => {
    expect(donorSkill).toBeDefined();
    const matched = donorSkill!.triggers.some((re) =>
      re.test("write an impact report for donors")
    );
    expect(matched).toBe(true);
  });

  it("does NOT fire on 'help me draft our grant proposal'", () => {
    expect(donorSkill).toBeDefined();
    const matched = donorSkill!.triggers.some((re) =>
      re.test("help me draft our grant proposal")
    );
    expect(matched).toBe(false);
  });

  it("does NOT fire on 'what's on my calendar today'", () => {
    expect(donorSkill).toBeDefined();
    const matched = donorSkill!.triggers.some((re) =>
      re.test("what's on my calendar today")
    );
    expect(matched).toBe(false);
  });
});

describe("selectVoiceSkillAddendum — donor-voice", () => {
  const DONOR_MSG = "write a thank-you letter to our major donor";
  const OFF_MSG = "what's on my calendar";

  it("returns a non-empty string for marketing_director + donor-intent message", () => {
    const result = selectVoiceSkillAddendum("marketing_director", DONOR_MSG);
    expect(result).not.toBe("");
  });

  it("result contains the distinctive phrase 'Donor Voice'", () => {
    const result = selectVoiceSkillAddendum("marketing_director", DONOR_MSG);
    expect(result).toContain("Donor Voice");
  });

  it("result contains 'Org voice takes precedence'", () => {
    const result = selectVoiceSkillAddendum("marketing_director", DONOR_MSG);
    expect(result).toContain("Org voice takes precedence");
  });

  it("returns '' for marketing_director + off-intent message", () => {
    const result = selectVoiceSkillAddendum("marketing_director", OFF_MSG);
    expect(result).toBe("");
  });

  it("returns '' for development_director + donor-intent message (wrong archetype)", () => {
    const result = selectVoiceSkillAddendum("development_director", DONOR_MSG);
    expect(result).toBe("");
  });

  it("returns '' for executive_assistant + donor-intent message (wrong archetype)", () => {
    const result = selectVoiceSkillAddendum("executive_assistant", DONOR_MSG);
    expect(result).toBe("");
  });
});

// -----------------------------------------------------------------------
// 5. board-comms trigger set and selectVoiceSkillAddendum
// -----------------------------------------------------------------------

describe("board-comms trigger set", () => {
  const boardSkill = VOICE_SKILLS.find((s) => s.id === "board-comms");

  it("fires on 'draft the ED report for the board'", () => {
    expect(boardSkill).toBeDefined();
    const matched = boardSkill!.triggers.some((re) =>
      re.test("draft the ED report for the board")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'write a board memo on the budget shortfall'", () => {
    expect(boardSkill).toBeDefined();
    const matched = boardSkill!.triggers.some((re) =>
      re.test("write a board memo on the budget shortfall")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'prepare the quarterly update to the board'", () => {
    expect(boardSkill).toBeDefined();
    const matched = boardSkill!.triggers.some((re) =>
      re.test("prepare the quarterly update to the board")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'draft a decision brief for the board meeting'", () => {
    expect(boardSkill).toBeDefined();
    const matched = boardSkill!.triggers.some((re) =>
      re.test("draft a decision brief for the board meeting")
    );
    expect(matched).toBe(true);
  });

  it("does NOT fire on 'write a thank-you letter to our donor'", () => {
    expect(boardSkill).toBeDefined();
    const matched = boardSkill!.triggers.some((re) =>
      re.test("write a thank-you letter to our donor")
    );
    expect(matched).toBe(false);
  });

  it("does NOT fire on 'what's on my calendar today'", () => {
    expect(boardSkill).toBeDefined();
    const matched = boardSkill!.triggers.some((re) =>
      re.test("what's on my calendar today")
    );
    expect(matched).toBe(false);
  });
});

describe("selectVoiceSkillAddendum — board-comms", () => {
  const BOARD_MSG = "draft the ED report for the board";
  const OFF_MSG = "what's on my calendar";

  it("returns a non-empty string for executive_assistant + board-intent message", () => {
    const result = selectVoiceSkillAddendum("executive_assistant", BOARD_MSG);
    expect(result).not.toBe("");
  });

  it("result contains the distinctive phrase 'Board Communications'", () => {
    const result = selectVoiceSkillAddendum("executive_assistant", BOARD_MSG);
    expect(result).toContain("Board Communications");
  });

  it("result contains 'Org voice takes precedence'", () => {
    const result = selectVoiceSkillAddendum("executive_assistant", BOARD_MSG);
    expect(result).toContain("Org voice takes precedence");
  });

  it("returns '' for executive_assistant + off-intent message", () => {
    const result = selectVoiceSkillAddendum("executive_assistant", OFF_MSG);
    expect(result).toBe("");
  });

  it("returns '' for development_director + board-intent message (wrong archetype)", () => {
    const result = selectVoiceSkillAddendum("development_director", BOARD_MSG);
    expect(result).toBe("");
  });

  it("returns '' for marketing_director + board-intent message (wrong archetype)", () => {
    const result = selectVoiceSkillAddendum("marketing_director", BOARD_MSG);
    expect(result).toBe("");
  });
});

// -----------------------------------------------------------------------
// 6. Sanity: first-match-wins and off-intent → ""
// -----------------------------------------------------------------------

describe("selectVoiceSkillAddendum — sanity checks", () => {
  it("a message matching multiple skills' words returns exactly ONE addendum (first match wins)", () => {
    // A message that contains words from both grant-narrative ("grant") and
    // donor-voice ("donor") sent to development_director — only grant-narrative
    // should fire (it's first in the array, and development_director is eligible).
    const msg = "draft a grant proposal and a donor thank-you";
    const result = selectVoiceSkillAddendum("development_director", msg);
    expect(result).toContain("Grant Narrative");
    expect(result).not.toContain("Donor Voice");
  });

  it("an off-intent message returns '' for every archetype", () => {
    const offMsg = "what's on my calendar today";
    const archetypes = [
      "development_director",
      "marketing_director",
      "executive_assistant",
      "programs_director",
      "events_director",
      "hr_volunteer_coordinator",
    ] as const;
    for (const arch of archetypes) {
      expect(selectVoiceSkillAddendum(arch, offMsg)).toBe("");
    }
  });
});

// -----------------------------------------------------------------------
// 7. Cache-integrity smoke: voice addendum is intent-gated and not in stable text
// -----------------------------------------------------------------------

describe("cache integrity: voice addendum is intent-gated and not in stable text", () => {
  it("voice addendum is empty for an off-intent development_director turn", () => {
    const addendum = selectVoiceSkillAddendum("development_director", "what's on my calendar");
    expect(addendum).toBe("");
  });

  it("voice addendum is empty for non-development_director archetypes on a grant-intent message", () => {
    const archetypes = ["executive_assistant", "marketing_director", "programs_director", "events_director", "hr_volunteer_coordinator"] as const;
    for (const arch of archetypes) {
      const addendum = selectVoiceSkillAddendum(arch, "draft our grant proposal for the Hartwell Foundation");
      expect(addendum).toBe("");
    }
  });

  it("voice addendum is empty for non-marketing_director archetypes on a donor-intent message", () => {
    const archetypes = ["development_director", "executive_assistant", "programs_director", "events_director", "hr_volunteer_coordinator"] as const;
    for (const arch of archetypes) {
      const addendum = selectVoiceSkillAddendum(arch, "write a thank-you letter to our major donor");
      expect(addendum).toBe("");
    }
  });

  it("voice addendum is empty for non-executive_assistant archetypes on a board-intent message", () => {
    const archetypes = ["development_director", "marketing_director", "programs_director", "events_director", "hr_volunteer_coordinator"] as const;
    for (const arch of archetypes) {
      const addendum = selectVoiceSkillAddendum(arch, "draft the ED report for the board");
      expect(addendum).toBe("");
    }
  });
});

// -----------------------------------------------------------------------
// 8. programs-director trigger set and selectVoiceSkillAddendum
// -----------------------------------------------------------------------

describe("programs-director trigger set", () => {
  const programsSkill = VOICE_SKILLS.find((s) => s.id === "programs-director");

  it("fires on 'draft our program impact report for this quarter'", () => {
    expect(programsSkill).toBeDefined();
    const matched = programsSkill!.triggers.some((re) =>
      re.test("draft our program impact report for this quarter")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'write a funder progress report for the Kellogg grant'", () => {
    expect(programsSkill).toBeDefined();
    const matched = programsSkill!.triggers.some((re) =>
      re.test("write a funder progress report for the Kellogg grant")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'help me write a participant story for the annual report'", () => {
    expect(programsSkill).toBeDefined();
    const matched = programsSkill!.triggers.some((re) =>
      re.test("help me write a participant story for the annual report")
    );
    expect(matched).toBe(true);
  });

  it("does NOT fire on 'draft our grant proposal for the Hartwell Foundation'", () => {
    expect(programsSkill).toBeDefined();
    const matched = programsSkill!.triggers.some((re) =>
      re.test("draft our grant proposal for the Hartwell Foundation")
    );
    expect(matched).toBe(false);
  });

  it("does NOT fire on 'draft the ED report for the board' (bare board report)", () => {
    expect(programsSkill).toBeDefined();
    const matched = programsSkill!.triggers.some((re) =>
      re.test("draft the ED report for the board")
    );
    expect(matched).toBe(false);
  });

  it("does NOT fire on 'what's on my calendar today'", () => {
    expect(programsSkill).toBeDefined();
    const matched = programsSkill!.triggers.some((re) =>
      re.test("what's on my calendar today")
    );
    expect(matched).toBe(false);
  });
});

describe("selectVoiceSkillAddendum — programs-director", () => {
  const ON_INTENT_MSG = "draft our program progress report for this quarter";
  const OFF_INTENT_MSG = "what's on my calendar";

  it("returns a non-empty string for programs_director + programs-intent message", () => {
    const result = selectVoiceSkillAddendum("programs_director", ON_INTENT_MSG);
    expect(result).not.toBe("");
  });

  it("result contains the distinctive phrase 'Programs Director'", () => {
    const result = selectVoiceSkillAddendum("programs_director", ON_INTENT_MSG);
    expect(result).toContain("Programs Director");
  });

  it("result contains 'Org voice takes precedence'", () => {
    const result = selectVoiceSkillAddendum("programs_director", ON_INTENT_MSG);
    expect(result).toContain("Org voice takes precedence");
  });

  it("returns '' for programs_director + off-intent message", () => {
    const result = selectVoiceSkillAddendum("programs_director", OFF_INTENT_MSG);
    expect(result).toBe("");
  });

  it("returns '' for development_director + programs-intent message (wrong archetype)", () => {
    const result = selectVoiceSkillAddendum("development_director", ON_INTENT_MSG);
    expect(result).toBe("");
  });

  it("returns '' for marketing_director + programs-intent message (wrong archetype)", () => {
    const result = selectVoiceSkillAddendum("marketing_director", ON_INTENT_MSG);
    expect(result).toBe("");
  });

  // Over-firing guards per PRD §8
  it("returns '' for programs_director on 'write a thank-you letter to our major donor'", () => {
    const result = selectVoiceSkillAddendum("programs_director", "write a thank-you letter to our major donor");
    expect(result).toBe("");
  });

  it("returns '' for programs_director on 'draft the ED report for the board'", () => {
    const result = selectVoiceSkillAddendum("programs_director", "draft the ED report for the board");
    expect(result).toBe("");
  });
});

// -----------------------------------------------------------------------
// 9. events-director trigger set and selectVoiceSkillAddendum
// -----------------------------------------------------------------------

describe("events-director trigger set", () => {
  const eventsSkill = VOICE_SKILLS.find((s) => s.id === "events-director");

  it("fires on 'draft an event invitation for our annual gala'", () => {
    expect(eventsSkill).toBeDefined();
    const matched = eventsSkill!.triggers.some((re) =>
      re.test("draft an event invitation for our annual gala")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'write a sponsorship pitch for our benefit dinner'", () => {
    expect(eventsSkill).toBeDefined();
    const matched = eventsSkill!.triggers.some((re) =>
      re.test("write a sponsorship pitch for our benefit dinner")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'send a save-the-date for the fall fundraiser'", () => {
    expect(eventsSkill).toBeDefined();
    const matched = eventsSkill!.triggers.some((re) =>
      re.test("send a save-the-date for the fall fundraiser")
    );
    expect(matched).toBe(true);
  });

  it("does NOT fire on 'write a thank-you letter to our major donor' (no event context)", () => {
    expect(eventsSkill).toBeDefined();
    const matched = eventsSkill!.triggers.some((re) =>
      re.test("write a thank-you letter to our major donor")
    );
    expect(matched).toBe(false);
  });

  it("does NOT fire on 'draft the ED report for the board'", () => {
    expect(eventsSkill).toBeDefined();
    const matched = eventsSkill!.triggers.some((re) =>
      re.test("draft the ED report for the board")
    );
    expect(matched).toBe(false);
  });

  it("does NOT fire on 'draft our need statement for the Hartwell Foundation'", () => {
    expect(eventsSkill).toBeDefined();
    const matched = eventsSkill!.triggers.some((re) =>
      re.test("draft our need statement for the Hartwell Foundation")
    );
    expect(matched).toBe(false);
  });

  it("does NOT fire on 'what's on my calendar today'", () => {
    expect(eventsSkill).toBeDefined();
    const matched = eventsSkill!.triggers.some((re) =>
      re.test("what's on my calendar today")
    );
    expect(matched).toBe(false);
  });
});

describe("selectVoiceSkillAddendum — events-director", () => {
  const ON_INTENT_MSG = "draft an event invitation for our annual gala";
  const OFF_INTENT_MSG = "what's on my calendar";

  it("returns a non-empty string for events_director + events-intent message", () => {
    const result = selectVoiceSkillAddendum("events_director", ON_INTENT_MSG);
    expect(result).not.toBe("");
  });

  it("result contains the distinctive phrase 'Events Director'", () => {
    const result = selectVoiceSkillAddendum("events_director", ON_INTENT_MSG);
    expect(result).toContain("Events Director");
  });

  it("result contains 'Org voice takes precedence'", () => {
    const result = selectVoiceSkillAddendum("events_director", ON_INTENT_MSG);
    expect(result).toContain("Org voice takes precedence");
  });

  it("returns '' for events_director + off-intent message", () => {
    const result = selectVoiceSkillAddendum("events_director", OFF_INTENT_MSG);
    expect(result).toBe("");
  });

  it("returns '' for development_director + events-intent message (wrong archetype)", () => {
    const result = selectVoiceSkillAddendum("development_director", ON_INTENT_MSG);
    expect(result).toBe("");
  });

  it("returns '' for marketing_director + events-intent message (wrong archetype)", () => {
    const result = selectVoiceSkillAddendum("marketing_director", ON_INTENT_MSG);
    expect(result).toBe("");
  });

  // Over-firing guards per PRD §8
  it("returns '' for events_director on 'write a thank-you letter to our major donor'", () => {
    const result = selectVoiceSkillAddendum("events_director", "write a thank-you letter to our major donor");
    expect(result).toBe("");
  });

  it("returns '' for events_director on 'draft the ED report for the board'", () => {
    const result = selectVoiceSkillAddendum("events_director", "draft the ED report for the board");
    expect(result).toBe("");
  });

  it("returns '' for events_director on 'draft our need statement for the Hartwell Foundation'", () => {
    const result = selectVoiceSkillAddendum("events_director", "draft our need statement for the Hartwell Foundation");
    expect(result).toBe("");
  });
});

// -----------------------------------------------------------------------
// 10. volunteer-coordinator trigger set and selectVoiceSkillAddendum
// -----------------------------------------------------------------------

describe("volunteer-coordinator trigger set", () => {
  const volunteerSkill = VOICE_SKILLS.find((s) => s.id === "volunteer-coordinator");

  it("fires on 'write a volunteer recruitment post for our summer program'", () => {
    expect(volunteerSkill).toBeDefined();
    const matched = volunteerSkill!.triggers.some((re) =>
      re.test("write a volunteer recruitment post for our summer program")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'draft a thank-you note for our volunteers who worked the shift'", () => {
    expect(volunteerSkill).toBeDefined();
    const matched = volunteerSkill!.triggers.some((re) =>
      re.test("draft a thank-you note for our volunteers who worked the shift")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'write volunteer onboarding welcome email'", () => {
    expect(volunteerSkill).toBeDefined();
    const matched = volunteerSkill!.triggers.some((re) =>
      re.test("write volunteer onboarding welcome email")
    );
    expect(matched).toBe(true);
  });

  it("does NOT fire on 'write a thank-you letter to our major donor' (no volunteer context)", () => {
    expect(volunteerSkill).toBeDefined();
    const matched = volunteerSkill!.triggers.some((re) =>
      re.test("write a thank-you letter to our major donor")
    );
    expect(matched).toBe(false);
  });

  it("does NOT fire on 'draft the ED report for the board'", () => {
    expect(volunteerSkill).toBeDefined();
    const matched = volunteerSkill!.triggers.some((re) =>
      re.test("draft the ED report for the board")
    );
    expect(matched).toBe(false);
  });

  it("does NOT fire on 'what's on my calendar today'", () => {
    expect(volunteerSkill).toBeDefined();
    const matched = volunteerSkill!.triggers.some((re) =>
      re.test("what's on my calendar today")
    );
    expect(matched).toBe(false);
  });
});

describe("selectVoiceSkillAddendum — volunteer-coordinator", () => {
  const ON_INTENT_MSG = "write a volunteer recruitment post for our event crew";
  const OFF_INTENT_MSG = "what's on my calendar";

  it("returns a non-empty string for hr_volunteer_coordinator + volunteer-intent message", () => {
    const result = selectVoiceSkillAddendum("hr_volunteer_coordinator", ON_INTENT_MSG);
    expect(result).not.toBe("");
  });

  it("result contains the distinctive phrase 'Volunteer Coordinator'", () => {
    const result = selectVoiceSkillAddendum("hr_volunteer_coordinator", ON_INTENT_MSG);
    expect(result).toContain("Volunteer Coordinator");
  });

  it("result contains 'Org voice takes precedence'", () => {
    const result = selectVoiceSkillAddendum("hr_volunteer_coordinator", ON_INTENT_MSG);
    expect(result).toContain("Org voice takes precedence");
  });

  it("returns '' for hr_volunteer_coordinator + off-intent message", () => {
    const result = selectVoiceSkillAddendum("hr_volunteer_coordinator", OFF_INTENT_MSG);
    expect(result).toBe("");
  });

  it("returns '' for development_director + volunteer-intent message (wrong archetype)", () => {
    const result = selectVoiceSkillAddendum("development_director", ON_INTENT_MSG);
    expect(result).toBe("");
  });

  it("returns '' for events_director + volunteer-intent message (wrong archetype)", () => {
    const result = selectVoiceSkillAddendum("events_director", ON_INTENT_MSG);
    expect(result).toBe("");
  });

  // Over-firing guards per PRD §8
  it("returns '' for hr_volunteer_coordinator on 'write a thank-you letter to our major donor'", () => {
    const result = selectVoiceSkillAddendum("hr_volunteer_coordinator", "write a thank-you letter to our major donor");
    expect(result).toBe("");
  });

  it("returns '' for hr_volunteer_coordinator on 'draft the ED report for the board'", () => {
    const result = selectVoiceSkillAddendum("hr_volunteer_coordinator", "draft the ED report for the board");
    expect(result).toBe("");
  });
});

// -----------------------------------------------------------------------
// 11. logic-model trigger set and selectVoiceSkillAddendum
// -----------------------------------------------------------------------

describe("logic-model trigger set", () => {
  const logicModelSkill = VOICE_SKILLS.find((s) => s.id === "logic-model");

  it("fires on 'build a logic model for our tutoring program'", () => {
    expect(logicModelSkill).toBeDefined();
    const matched = logicModelSkill!.triggers.some((re) =>
      re.test("build a logic model for our tutoring program")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'fill in the logic model and outcomes section'", () => {
    expect(logicModelSkill).toBeDefined();
    const matched = logicModelSkill!.triggers.some((re) =>
      re.test("fill in the logic model and outcomes section")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'draft the theory of change section'", () => {
    expect(logicModelSkill).toBeDefined();
    const matched = logicModelSkill!.triggers.some((re) =>
      re.test("draft the theory of change section")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'describe the causal chain for our program'", () => {
    expect(logicModelSkill).toBeDefined();
    const matched = logicModelSkill!.triggers.some((re) =>
      re.test("describe the causal chain for our program")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'how do we measure our program outcomes?' (migrated outcomes trigger)", () => {
    expect(logicModelSkill).toBeDefined();
    const matched = logicModelSkill!.triggers.some((re) =>
      re.test("how do we measure our program outcomes?")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'we need to report outcomes to the funder' (migrated outcomes trigger)", () => {
    expect(logicModelSkill).toBeDefined();
    const matched = logicModelSkill!.triggers.some((re) =>
      re.test("we need to report outcomes to the funder")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'pull together our outcomes data for the report' (migrated outcomes trigger)", () => {
    expect(logicModelSkill).toBeDefined();
    const matched = logicModelSkill!.triggers.some((re) =>
      re.test("pull together our outcomes data for the report")
    );
    expect(matched).toBe(true);
  });

  it("does NOT fire on 'what's on my calendar today'", () => {
    expect(logicModelSkill).toBeDefined();
    const matched = logicModelSkill!.triggers.some((re) =>
      re.test("what's on my calendar today")
    );
    expect(matched).toBe(false);
  });

  it("does NOT fire on 'outcome of the gala' (generic English use)", () => {
    expect(logicModelSkill).toBeDefined();
    const matched = logicModelSkill!.triggers.some((re) =>
      re.test("what was the outcome of the gala?")
    );
    expect(matched).toBe(false);
  });

  it("does NOT fire on 'the final outcome' (generic English use)", () => {
    expect(logicModelSkill).toBeDefined();
    const matched = logicModelSkill!.triggers.some((re) =>
      re.test("let's talk about the final outcome")
    );
    expect(matched).toBe(false);
  });
});

describe("selectVoiceSkillAddendum — logic-model", () => {
  const ON_INTENT_MSG = "build a logic model for our tutoring program";
  const OFF_INTENT_MSG = "what's on my calendar";

  it("returns a non-empty string for development_director + logic-model-intent message", () => {
    const result = selectVoiceSkillAddendum("development_director", ON_INTENT_MSG);
    expect(result).not.toBe("");
  });

  it("result contains the distinctive phrase 'Logic Model'", () => {
    const result = selectVoiceSkillAddendum("development_director", ON_INTENT_MSG);
    expect(result).toContain("Logic Model");
  });

  it("result contains 'Org voice takes precedence'", () => {
    const result = selectVoiceSkillAddendum("development_director", ON_INTENT_MSG);
    expect(result).toContain("Org voice takes precedence");
  });

  it("returns '' for development_director + off-intent message", () => {
    const result = selectVoiceSkillAddendum("development_director", OFF_INTENT_MSG);
    expect(result).toBe("");
  });

  it("returns '' for events_director + logic-model message (wrong archetype)", () => {
    const result = selectVoiceSkillAddendum("events_director", ON_INTENT_MSG);
    expect(result).toBe("");
  });

  it("returns '' for marketing_director + logic-model message (wrong archetype)", () => {
    const result = selectVoiceSkillAddendum("marketing_director", ON_INTENT_MSG);
    expect(result).toBe("");
  });
});

// -----------------------------------------------------------------------
// 12. evaluation-plan trigger set and selectVoiceSkillAddendum
// -----------------------------------------------------------------------

describe("evaluation-plan trigger set", () => {
  const evalPlanSkill = VOICE_SKILLS.find((s) => s.id === "evaluation-plan");

  it("fires on 'write the evaluation plan section'", () => {
    expect(evalPlanSkill).toBeDefined();
    const matched = evalPlanSkill!.triggers.some((re) =>
      re.test("write the evaluation plan section")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'help me draft our evaluation section'", () => {
    expect(evalPlanSkill).toBeDefined();
    const matched = evalPlanSkill!.triggers.some((re) =>
      re.test("help me draft our evaluation section")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'how will we measure success in this grant?'", () => {
    expect(evalPlanSkill).toBeDefined();
    const matched = evalPlanSkill!.triggers.some((re) =>
      re.test("how will we measure success in this grant?")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'what indicators should we include in the proposal?'", () => {
    expect(evalPlanSkill).toBeDefined();
    const matched = evalPlanSkill!.triggers.some((re) =>
      re.test("what indicators should we include in the proposal?")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'describe our data collection plan'", () => {
    expect(evalPlanSkill).toBeDefined();
    const matched = evalPlanSkill!.triggers.some((re) =>
      re.test("describe our data collection plan")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'draft a measurement plan for the grant'", () => {
    expect(evalPlanSkill).toBeDefined();
    const matched = evalPlanSkill!.triggers.some((re) =>
      re.test("draft a measurement plan for the grant")
    );
    expect(matched).toBe(true);
  });

  it("does NOT fire on 'what's on my calendar today'", () => {
    expect(evalPlanSkill).toBeDefined();
    const matched = evalPlanSkill!.triggers.some((re) =>
      re.test("what's on my calendar today")
    );
    expect(matched).toBe(false);
  });

  it("does NOT fire on 'write a donor thank-you letter'", () => {
    expect(evalPlanSkill).toBeDefined();
    const matched = evalPlanSkill!.triggers.some((re) =>
      re.test("write a donor thank-you letter")
    );
    expect(matched).toBe(false);
  });
});

describe("selectVoiceSkillAddendum — evaluation-plan", () => {
  const ON_INTENT_MSG = "write the evaluation plan section for our grant";
  const OFF_INTENT_MSG = "what's on my calendar";

  it("returns a non-empty string for development_director + evaluation-intent message", () => {
    const result = selectVoiceSkillAddendum("development_director", ON_INTENT_MSG);
    expect(result).not.toBe("");
  });

  it("result contains the distinctive phrase 'Evaluation Plan'", () => {
    const result = selectVoiceSkillAddendum("development_director", ON_INTENT_MSG);
    expect(result).toContain("Evaluation Plan");
  });

  it("result contains 'Org voice takes precedence'", () => {
    const result = selectVoiceSkillAddendum("development_director", ON_INTENT_MSG);
    expect(result).toContain("Org voice takes precedence");
  });

  it("returns '' for development_director + off-intent message", () => {
    const result = selectVoiceSkillAddendum("development_director", OFF_INTENT_MSG);
    expect(result).toBe("");
  });

  it("returns '' for marketing_director + evaluation-intent message (wrong archetype)", () => {
    const result = selectVoiceSkillAddendum("marketing_director", ON_INTENT_MSG);
    expect(result).toBe("");
  });

  it("returns '' for programs_director + evaluation-intent message (wrong archetype)", () => {
    const result = selectVoiceSkillAddendum("programs_director", ON_INTENT_MSG);
    expect(result).toBe("");
  });
});

// -----------------------------------------------------------------------
// 13. budget-narrative trigger set and selectVoiceSkillAddendum
// -----------------------------------------------------------------------

describe("budget-narrative trigger set", () => {
  const budgetSkill = VOICE_SKILLS.find((s) => s.id === "budget-narrative");

  it("fires on 'draft the budget narrative for this proposal'", () => {
    expect(budgetSkill).toBeDefined();
    const matched = budgetSkill!.triggers.some((re) =>
      re.test("draft the budget narrative for this proposal")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'write a budget justification for the NIH grant'", () => {
    expect(budgetSkill).toBeDefined();
    const matched = budgetSkill!.triggers.some((re) =>
      re.test("write a budget justification for the NIH grant")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'how do I explain each line item in the budget?'", () => {
    expect(budgetSkill).toBeDefined();
    const matched = budgetSkill!.triggers.some((re) =>
      re.test("how do I explain each line item in the budget?")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'help me justify our personnel costs'", () => {
    expect(budgetSkill).toBeDefined();
    const matched = budgetSkill!.triggers.some((re) =>
      re.test("help me justify our personnel costs")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'what indirect rate should we use in the proposal?'", () => {
    expect(budgetSkill).toBeDefined();
    const matched = budgetSkill!.triggers.some((re) =>
      re.test("what indirect rate should we use in the proposal?")
    );
    expect(matched).toBe(true);
  });

  it("fires on 'calculate the cost per participant for this program'", () => {
    expect(budgetSkill).toBeDefined();
    const matched = budgetSkill!.triggers.some((re) =>
      re.test("calculate the cost per participant for this program")
    );
    expect(matched).toBe(true);
  });

  it("does NOT fire on 'what's on my calendar today'", () => {
    expect(budgetSkill).toBeDefined();
    const matched = budgetSkill!.triggers.some((re) =>
      re.test("what's on my calendar today")
    );
    expect(matched).toBe(false);
  });

  it("does NOT fire on 'draft a board memo on the budget shortfall' (board context, not budget narrative)", () => {
    expect(budgetSkill).toBeDefined();
    const matched = budgetSkill!.triggers.some((re) =>
      re.test("draft a board memo on the budget shortfall")
    );
    expect(matched).toBe(false);
  });
});

describe("selectVoiceSkillAddendum — budget-narrative", () => {
  const ON_INTENT_MSG = "draft the budget narrative for our grant proposal";
  const OFF_INTENT_MSG = "what's on my calendar";

  it("returns a non-empty string for development_director + budget-narrative-intent message", () => {
    const result = selectVoiceSkillAddendum("development_director", ON_INTENT_MSG);
    expect(result).not.toBe("");
  });

  it("result contains the distinctive phrase 'Budget Narrative'", () => {
    const result = selectVoiceSkillAddendum("development_director", ON_INTENT_MSG);
    expect(result).toContain("Budget Narrative");
  });

  it("result contains 'Org voice takes precedence'", () => {
    const result = selectVoiceSkillAddendum("development_director", ON_INTENT_MSG);
    expect(result).toContain("Org voice takes precedence");
  });

  it("returns '' for development_director + off-intent message", () => {
    const result = selectVoiceSkillAddendum("development_director", OFF_INTENT_MSG);
    expect(result).toBe("");
  });

  it("returns '' for marketing_director + budget-narrative message (wrong archetype)", () => {
    const result = selectVoiceSkillAddendum("marketing_director", ON_INTENT_MSG);
    expect(result).toBe("");
  });

  it("returns '' for executive_assistant + budget-narrative message (wrong archetype)", () => {
    const result = selectVoiceSkillAddendum("executive_assistant", ON_INTENT_MSG);
    expect(result).toBe("");
  });
});

// -----------------------------------------------------------------------
// 14. Migration regression: migrated triggers now select logic-model, NOT grant-narrative
// -----------------------------------------------------------------------

describe("migration regression — logic model + outcomes triggers", () => {
  it("'build a logic model for our tutoring program' selects logic-model, not grant-narrative", () => {
    const result = selectVoiceSkillAddendum("development_director", "build a logic model for our tutoring program");
    expect(result).toContain("Logic Model");
    expect(result).not.toContain("Grant Narrative");
  });

  it("'fill in the logic model and outcomes section' selects logic-model, not grant-narrative", () => {
    const result = selectVoiceSkillAddendum("development_director", "fill in the logic model and outcomes section");
    expect(result).toContain("Logic Model");
    expect(result).not.toContain("Grant Narrative");
  });

  it("'we need to report outcomes to the funder' selects logic-model, not grant-narrative", () => {
    const result = selectVoiceSkillAddendum("development_director", "we need to report outcomes to the funder");
    expect(result).toContain("Logic Model");
    expect(result).not.toContain("Grant Narrative");
  });

  it("'how do we measure our program outcomes?' selects logic-model, not grant-narrative", () => {
    const result = selectVoiceSkillAddendum("development_director", "how do we measure our program outcomes?");
    expect(result).toContain("Logic Model");
    expect(result).not.toContain("Grant Narrative");
  });

  it("'pull together our outcomes data for the report' selects logic-model, not grant-narrative", () => {
    const result = selectVoiceSkillAddendum("development_director", "pull together our outcomes data for the report");
    expect(result).toContain("Logic Model");
    expect(result).not.toContain("Grant Narrative");
  });

  it("grant-narrative still fires for non-migrated triggers like 'grant proposal'", () => {
    const result = selectVoiceSkillAddendum("development_director", "help me write the grant proposal");
    expect(result).toContain("Grant Narrative");
    expect(result).not.toContain("Logic Model");
  });

  it("grant-narrative still fires for 'need statement'", () => {
    const result = selectVoiceSkillAddendum("development_director", "draft our need statement for the funder");
    expect(result).toContain("Grant Narrative");
  });
});

// -----------------------------------------------------------------------
// 15. Precedence: mixed grant+section message selects the section skill (more-specific-wins)
// -----------------------------------------------------------------------

describe("precedence — section skills win over grant-narrative for mixed messages", () => {
  it("'build a logic model for our grant proposal' selects logic-model (section wins)", () => {
    // Message contains both "logic model" (logic-model trigger) and "grant proposal" (grant-narrative trigger).
    // logic-model is earlier in the VOICE_SKILLS array — section-specific skill wins.
    const result = selectVoiceSkillAddendum("development_director", "build a logic model for our grant proposal");
    expect(result).toContain("Logic Model");
    expect(result).not.toContain("Grant Narrative");
  });

  it("'write the evaluation plan for our grant proposal' selects evaluation-plan (section wins)", () => {
    const result = selectVoiceSkillAddendum("development_director", "write the evaluation plan for our grant proposal");
    expect(result).toContain("Evaluation Plan");
    expect(result).not.toContain("Grant Narrative");
  });

  it("'draft the budget narrative for our grant proposal' selects budget-narrative (section wins)", () => {
    const result = selectVoiceSkillAddendum("development_director", "draft the budget narrative for our grant proposal");
    expect(result).toContain("Budget Narrative");
    expect(result).not.toContain("Grant Narrative");
  });

  it("a pure grant message with no section phrase still selects grant-narrative", () => {
    // No section-specific trigger words present.
    const result = selectVoiceSkillAddendum("development_director", "help me write a compelling need statement for the Hartwell Foundation");
    expect(result).toContain("Grant Narrative");
  });
});
