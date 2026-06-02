/**
 * Unit tests for the voice-skill registry.
 *
 * Covers:
 *  1. Trigger set: grant-narrative fires on on-intent messages and not on off-intent ones.
 *     Also verifies tightened triggers for "foundation" and "outcomes".
 *  2. selectVoiceSkillAddendum returns a non-empty string (with a distinctive phrase)
 *     for an eligible archetype + on-intent message; empty string for off-intent.
 *  3. A non-eligible archetype with a grant-intent message still returns "".
 *  4. donor-voice: fires for marketing_director on donor-intent messages.
 *  5. board-comms: fires for executive_assistant on board-intent messages.
 *  6. Sanity: multi-skill-word message returns exactly ONE addendum (first match wins);
 *     off-intent message returns "".
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

  // --- Tightened "outcomes" trigger tests ---

  it("fires on 'report outcomes to the funder' (reporting context)", () => {
    expect(grantSkill).toBeDefined();
    const matched = grantSkill!.triggers.some((re) => re.test("we need to report outcomes to the funder"));
    expect(matched).toBe(true);
  });

  it("fires on 'measure our program outcomes' (measurement context)", () => {
    expect(grantSkill).toBeDefined();
    const matched = grantSkill!.triggers.some((re) => re.test("how do we measure our program outcomes?"));
    expect(matched).toBe(true);
  });

  it("fires on 'logic model and outcomes' (grant context)", () => {
    expect(grantSkill).toBeDefined();
    const matched = grantSkill!.triggers.some((re) => re.test("fill in the logic model and outcomes section"));
    expect(matched).toBe(true);
  });

  it("fires on 'outcomes data for the report'", () => {
    expect(grantSkill).toBeDefined();
    const matched = grantSkill!.triggers.some((re) => re.test("pull together our outcomes data for the report"));
    expect(matched).toBe(true);
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
