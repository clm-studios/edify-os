/**
 * Anthropic tool definitions for the grant-writing MVP (feat/grant-writing-mvp).
 *
 * Two tools registered for Development Director:
 *   - draft_grant_content: content_type enum supports MVP-4 types;
 *     other types accepted in TS but return is_error for v2 deferrals.
 *   - revise_grant_content: tone-enum driven revision of existing drafts.
 *
 * Both use Sonnet routing for MVP. Haiku routing per content_type is v2
 * performance work (per PRD §F1 model-routing column — Haiku for
 * budget_narrative / cover_letter — deferred until v2).
 *
 * Forward compat (PRD §F8): draft_grant_content handler accepts an optional
 * skillBody slot for the future skill-routing pattern. It is null in MVP.
 * The handler's system-prompt assembly already structures the optional slot.
 */

import type Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// System-prompt addendum
// ---------------------------------------------------------------------------

export const GRANT_WRITING_TOOLS_ADDENDUM = `
## Grant writing tools
You have two grant-writing tools available for drafting and revising content.

Use \`draft_grant_content\` when the user asks you to draft any section of a grant application. Supported section types for MVP: loi (Letter of Inquiry), statement_of_need, project_description, budget_narrative. The proof library (prior_grants, outcomes, voice_samples) is loaded automatically — every number, outcome, and voice phrase in the draft must cite [N] to a proof library entry, or be written without specific figures rather than invented (cite-or-reject contract).

Use \`revise_grant_content\` when the user wants to improve an existing draft. Accept a draft_id (from the pipeline) or pass draft_text directly. Apply the requested tone change precisely.

Citation discipline: every number, outcome, and voice phrase in a draft MUST cite [N] where N is the memory entry id. If you cannot source a claim, write it without specific numbers rather than inventing them.`;

// ---------------------------------------------------------------------------
// MVP content types — buildable now
// ---------------------------------------------------------------------------

export const MVP_CONTENT_TYPES = [
  "loi",
  "statement_of_need",
  "project_description",
  "budget_narrative",
] as const;

export type MvpContentType = (typeof MVP_CONTENT_TYPES)[number];

// Full enum including v2 types — present in TS type but not MVP-buildable.
// Tool schema exposes all types; handler returns is_error for non-MVP types.
export type GrantContentType =
  | MvpContentType
  | "executive_summary"
  | "goals_and_objectives"
  | "methodology"
  | "evaluation_plan"
  | "sustainability_plan"
  | "organizational_background"
  | "cover_letter";

// Tone enums for revise_grant_content (per PRD §F1)
export type RevisionTone =
  | "tighten"
  | "more_specific"
  | "less_jargon"
  | "more_urgent"
  | "add_data"
  | "cite_examples";

// ---------------------------------------------------------------------------
// Tool definitions (model-facing)
// ---------------------------------------------------------------------------

export const grantWritingTools: Anthropic.Tool[] = [
  {
    name: "draft_grant_content",
    description:
      "Draft a section of a grant application using the org's proof library (prior grants, outcomes, voice samples). Supported types for MVP: loi, statement_of_need, project_description, budget_narrative. Every specific number or outcome in the draft will cite [N] to a proof library entry so the user can verify. Returns the drafted content as Markdown with inline citations.",
    input_schema: {
      type: "object" as const,
      properties: {
        grant_id: {
          type: "string",
          description:
            "The pipeline grant_id to associate this draft with. Required if the grant is already in the pipeline. Omit for exploratory drafts not yet tracked.",
        },
        content_type: {
          type: "string",
          enum: [
            "loi",
            "statement_of_need",
            "project_description",
            "budget_narrative",
            "executive_summary",
            "goals_and_objectives",
            "methodology",
            "evaluation_plan",
            "sustainability_plan",
            "organizational_background",
            "cover_letter",
          ],
          description:
            "The section type to draft. MVP supports: loi, statement_of_need, project_description, budget_narrative. Other types return an error — coming in v2.",
        },
        funder_name: {
          type: "string",
          description:
            "Name of the funder this LOI/proposal is addressed to. Used to personalize tone and search prior grant history.",
        },
        amount_requested: {
          type: "number",
          description:
            "Dollar amount being requested. If omitted, the draft will use a placeholder.",
        },
        notes_from_user: {
          type: "string",
          description:
            "Any specific instructions, context, or emphases the user wants incorporated. Examples: 'focus on the Kodama AI component', 'mention our MEAF partnership history', 'keep under 500 words'.",
        },
        budget_table: {
          type: "string",
          description:
            "Markdown or plain-text budget table. Required when content_type = budget_narrative. Ignored for other types.",
        },
        signatory_name: {
          type: "string",
          description:
            "ED name for cover letter signature. Only relevant when content_type = cover_letter (v2). Ignored for MVP types.",
        },
        signatory_title: {
          type: "string",
          description:
            "ED title for cover letter signature. Only relevant when content_type = cover_letter (v2). Ignored for MVP types.",
        },
      },
      required: ["content_type"],
    },
  },
  {
    name: "revise_grant_content",
    description:
      "Revise an existing grant section draft based on user feedback and/or a tone change direction. Pass the current draft text and specify what you want changed. Returns the revised content as Markdown, preserving all citations from the original.",
    input_schema: {
      type: "object" as const,
      properties: {
        draft_id: {
          type: "string",
          description:
            "Optional ID of the draft in the grants_pipeline.drafts array. If provided, the handler loads the draft from the pipeline. If omitted, pass draft_text directly.",
        },
        draft_text: {
          type: "string",
          description:
            "The current draft text to revise. Required if draft_id is not provided.",
        },
        content_type: {
          type: "string",
          enum: [
            "loi",
            "statement_of_need",
            "project_description",
            "budget_narrative",
            "executive_summary",
            "goals_and_objectives",
            "methodology",
            "evaluation_plan",
            "sustainability_plan",
            "organizational_background",
            "cover_letter",
          ],
          description: "The section type being revised. Informs the revision system prompt.",
        },
        feedback: {
          type: "string",
          description:
            "Free-form feedback from the user on what to change. Examples: 'The opening is too organizational — lead with the participants instead.', 'Cut 200 words from the need section.', 'Add the 2024 impact report data.'",
        },
        tone_change: {
          type: "string",
          enum: [
            "tighten",
            "more_specific",
            "less_jargon",
            "more_urgent",
            "add_data",
            "cite_examples",
          ],
          description:
            "Optional tone direction: tighten (cut 15-25%), more_specific (add concrete details), less_jargon (plain language), more_urgent (increase stakes), add_data (pull in more outcome figures), cite_examples (add participant vignettes or case details).",
        },
      },
      // Intentional: draft_id and draft_text are both optional — the handler validates that at least one is provided.
      required: [],
    },
  },
];
