/**
 * Anthropic Agent Skills registry — maps each archetype slug to the
 * pre-built skills it should have access to.
 *
 * Skills are passed via `container.skills` in `client.beta.messages.create()`.
 * They require:
 *   - beta headers: "code-execution-2025-08-25" + "skills-2025-10-02"
 *   - the code_execution tool in the tools array
 *
 * Adding a skill to an archetype:  add the skill_id to the array below.
 * Available pre-built IDs: "xlsx" | "pptx" | "docx" | "pdf"
 *
 * ---
 *
 * Frontend Design skill (Marketing Director only):
 * The open-source `frontend-design` skill from anthropics/skills is a
 * *design reasoning* skill — not a document generator. It is NOT in the
 * pre-built skill_id list (which is just docx/xlsx/pptx/pdf), and Anthropic's
 * API only accepts those pre-built IDs in `container.skills[].skill_id`.
 * So we integrate it as a system-prompt augmentation instead: when the user
 * message shows design intent ("mockup / UI / layout / landing page / etc.")
 * we append FRONTEND_DESIGN_ADDENDUM to the system prompt. No code execution,
 * no beta headers, no container — this is a pure prompt-engineering skill.
 * Source: https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md
 */

import { ARCHETYPE_SLUGS, type ArchetypeSlug } from "@/lib/archetypes";

export type AnthropicSkillId = "xlsx" | "pptx" | "docx" | "pdf";

/**
 * Archetype → eligible skills (full list of formats each archetype CAN use).
 * At runtime, only 1 skill is attached per API call based on user message intent.
 * Anthropic API expands each pre-built skill into ~5 internal sub-components,
 * so the 8-item limit only allows 1 skill per call.
 */
export const ARCHETYPE_SKILLS: Record<ArchetypeSlug, AnthropicSkillId[]> = {
  executive_assistant: ["docx", "xlsx", "pdf"],
  events_director: ["pptx", "xlsx", "pdf"],
  development_director: ["docx", "xlsx", "pdf"],
  marketing_director: ["pptx", "docx", "pdf"],
  programs_director: ["docx", "xlsx", "pdf"],
  hr_volunteer_coordinator: ["docx", "xlsx", "pdf"],
};

// Exhaust-check: TypeScript errors here if ARCHETYPE_SLUGS drifts from this map.
const _exhaustCheck: Record<ArchetypeSlug, unknown> = ARCHETYPE_SKILLS;
void _exhaustCheck;
void ARCHETYPE_SLUGS; // referenced to keep import live

/**
 * System-prompt addendum injected whenever the archetype has skills.
 * Tells the model to produce real files, not just text.
 */
export const SKILLS_ADDENDUM = `

You have access to file-generation skills for creating Word docs, Excel spreadsheets, PowerPoint presentations, and PDFs. Use them when the user asks for deliverable documents, not just text. For example, a grant proposal should be a .docx the user can download, not just text in chat.
`;

/** Code execution tool definition required alongside skills. */
export const CODE_EXECUTION_TOOL = {
  type: "code_execution_20250825" as const,
  name: "code_execution" as const,
};

/**
 * Beta headers required when using skills.
 * Includes files-api-2025-04-14 since skill execution may return file outputs
 * retrieved via anthropic.beta.files.retrieveMetadata().
 */
export const SKILLS_BETA_HEADERS = [
  "code-execution-2025-08-25",
  "skills-2025-10-02",
  "files-api-2025-04-14",
] as const;

/**
 * MIME types for files served via /api/files/[fileId], keyed by lowercase extension.
 * Covers both Anthropic Skill outputs (docx/xlsx/pptx/pdf) and tool outputs that
 * upload to the same Anthropic Files store (png/jpg from render_design_to_image).
 */
export const SKILL_MIME: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

// ---------------------------------------------------------------------------
// C. Skills-on-demand — only attach skills when message suggests doc generation
// ---------------------------------------------------------------------------

const SKILLS_TRIGGER_PATTERNS = [
  /\b(draft|create|generate|build|make|write|produce|compose)\b.*\b(doc|document|deck|slide|presentation|spreadsheet|excel|word|pdf|report|proposal|letter|email|newsletter|memo|policy)\b/i,
  /\bcan you\s+(draft|create|generate|build|make|write|produce|compose)/i,
  /\b(as a |in a )?(\.docx|\.xlsx|\.pptx|\.pdf|google doc|powerpoint|excel)\b/i,
  /\b(put it in|save it as|export as)\b/i,
];

/**
 * Returns true when the user's message suggests a document-generation intent.
 * Used to decide whether to attach skills to the API call.
 */
export function shouldAttachSkills(userMessage: string): boolean {
  return SKILLS_TRIGGER_PATTERNS.some((re) => re.test(userMessage));
}

/** Format detection patterns -- matched against user message to pick the right skill. */
const FORMAT_PATTERNS: { skill: AnthropicSkillId; patterns: RegExp[] }[] = [
  {
    skill: "xlsx",
    patterns: [
      /\b(spreadsheet|excel|xlsx|\.xlsx|workbook|csv)\b/i,
      /\b(budget|financ|ledger|invoice|expense|revenue|forecast|tracker|tracking)\b.*\b(sheet|table|report)\b/i,
    ],
  },
  {
    skill: "pptx",
    patterns: [
      /\b(presentation|powerpoint|pptx|\.pptx|slide|slides|deck)\b/i,
      /\b(pitch deck|board presentation|keynote)\b/i,
    ],
  },
  {
    skill: "pdf",
    patterns: [
      /\b(pdf|\.pdf)\b/i,
      /\b(as a pdf|save.*pdf|export.*pdf|convert.*pdf)\b/i,
    ],
  },
  {
    skill: "docx",
    patterns: [
      /\b(doc|document|docx|\.docx|word|letter|memo|proposal|report|policy|newsletter|grant)\b/i,
    ],
  },
];

/**
 * Detect the single best skill to attach based on the user's message.
 * Returns the most relevant format from the archetype's eligible skills,
 * or the archetype's first skill as fallback.
 */
export function detectSkillForMessage(
  userMessage: string,
  eligibleSkills: AnthropicSkillId[]
): AnthropicSkillId {
  for (const { skill, patterns } of FORMAT_PATTERNS) {
    if (!eligibleSkills.includes(skill)) continue;
    if (patterns.some((re) => re.test(userMessage))) return skill;
  }
  // Fallback: first eligible skill (docx or pptx depending on archetype)
  return eligibleSkills[0];
}

/**
 * Build the `container` parameter for `client.beta.messages.create()`.
 * Always sends exactly 1 skill to stay under the API's 8-item expansion limit.
 * Returns undefined when no skills provided.
 */
export function buildContainer(
  skillIds: AnthropicSkillId[]
): { skills: Array<{ type: "anthropic"; skill_id: string; version: string }> } | undefined {
  if (skillIds.length === 0) return undefined;
  // Only 1 skill per call -- API expands each into ~5 sub-components
  const selected = skillIds.slice(0, 1);
  return {
    skills: selected.map((id) => ({
      type: "anthropic" as const,
      skill_id: id,
      version: "latest",
    })),
  };
}

// ---------------------------------------------------------------------------
// E. Voice Skills — system-prompt addendum skills gated by intent + archetype
// ---------------------------------------------------------------------------

/**
 * A voice skill is a reasoning/craft addendum injected as a system-prompt
 * augmentation (Block 2, uncached) when:
 *   (a) the turn's archetype is in the skill's `archetypes` set, AND
 *   (b) the user message matches at least one of the skill's `triggers`.
 *
 * Exactly one voice skill fires per turn (first match wins) to keep Block 2 bounded.
 * No code execution, no beta headers, no container — pure prompt engineering.
 */
export interface VoiceSkill {
  id: string;
  archetypes: ReadonlySet<ArchetypeSlug>;
  triggers: RegExp[];
  addendum: string;
}

// Grant-narrative body (verbatim from ~/life/projects/edify-os/archetype-voice-skills/grant-narrative.md)
// Frontmatter stripped; everything from the first `#` heading down is preserved.
const GRANT_NARRATIVE_ADDENDUM = `
# Grant Narrative

You are the organization's Development Director writing for a specific funder. Your job is to make a reviewer who has never met this org believe, in their first read, that it is competent, necessary, and a safe place to put money.

## Stance

Write as the organization, not about it. First person plural ("we serve," "our families"), present-tense for ongoing work. You are an insider who knows the programs intimately, addressing a skeptical-but-fair outsider who reads forty of these a week.

## Voice principles

Lead with the people served, not the organization's needs. A funder funds impact on a community, not an org's survival. Open need statements with who is affected and how, before naming the org.

Be concrete over earnest. One specific family, one real number, one named program beats three sentences of mission language. Replace "we are deeply committed to empowering underserved youth" with what you actually do, for whom, and what changed.

Use the funder's own framing. If the foundation funds "economic mobility," name economic mobility; don't make the reviewer translate your words into their priorities.

Quantify, then humanize. Pair every key number with a one-line image of what it means on the ground. Numbers earn trust; the image makes it stick.

Claim only what you can defend. Reviewers test confident claims. If you say "the only program of its kind in the region," it had better be true and citable.

## Structure for common sections

Need / problem statement: who is affected → scale (local data, cited) → why existing responses fall short → the specific gap this proposal fills. Do not pad with national statistics the reviewer already knows; localize.

Program description: what you will do, in concrete activities, with who delivers it, on what timeline, for how many. A reviewer should be able to picture a participant moving through the program.

Goals & outcomes: distinguish outputs (what you deliver) from outcomes (what changes for participants). State how each outcome is measured. Avoid outcomes you have no plausible way to measure.

Organizational capacity: evidence you can execute — track record, relevant staff, partnerships, prior results. Show, with specifics, don't assert.

Sustainability: be honest. Reviewers distrust "we will seek additional funding" with no plan. Name diversification, earned revenue, or institutional commitments.

## Worked examples (weak → strong)

These show the principles in action. The org name, programs, and figures here are PLACEHOLDERS — at runtime they come from the org's substrate; what matters is the *shape* of strong vs. weak writing. Bracketed \`[cited: ...]\` marks where a real stored figure + citation slots in; \`[need: ...]\` marks a gap to flag rather than invent.

**1 — Need-statement opening (lead with people, localize, cite).**
- ❌ Weak: "Our organization is deeply committed to empowering underserved youth in our community. For over a decade we have worked tirelessly to make a difference." — opens with the org, all adjectives, no who/scale/source.
- ✅ Strong: "In [County], [X,XXX students; cited: outcomes_data] leave third grade reading below grade level — and in the [three neighborhood] schools we serve, it's [Y%; cited]. A child who misses this milestone is four times less likely to graduate [cited: source]. No free, school-day tutoring reaches these schools; [Org] [need: verify 'is the only provider']." — who → local scale (cited) → why it matters → the specific gap.

**2 — Concrete over earnest.**
- ❌ Weak: "We provide holistic, wraparound support to help families thrive."
- ✅ Strong: "Each family works with one coach for 12 months on three goals they choose: a savings target, a job or training step, and one stabilizing need — childcare, transport, or housing."

**3 — Quantify, then humanize.**
- ❌ Weak: "Last year we served 1,200 individuals through our programs."
- ✅ Strong: "Last year [1,200 people; cited: outcomes_data] moved through the program — about [25] every Tuesday morning, the room full before the doors open."

**4 — Outcomes vs. outputs.**
- ❌ Weak (output, or an unmeasurable wish): "We will deliver 500 tutoring sessions." / "We will empower youth to reach their potential."
- ✅ Strong (measurable outcome): "By June, [70%] of enrolled students will gain at least one reading level, measured by [the STAR assessment] at intake and exit."

**5 — Citation discipline in practice.**
- ❌ Weak: "We've helped thousands of families achieve financial stability over the years."
- ✅ Strong: "Since [2019], [1,840] families have completed the program [cited: outcomes_data]; of those, [62%] grew their savings within a year [cited: 2024 evaluation]." — and if the figure isn't stored: "[need: % who grew savings] of families improved their financial position."

**6 — Mirror the funder's framing.**
- Funder funds "economic mobility." ❌ Weak: "We reduce poverty and build community." ✅ Strong: "Our program targets the two levers most tied to economic mobility for our families: stable income and liquid savings."

## Using org context

Draw program names, populations, and numbers from the org's stored \`programs\` and \`outcomes_data\` — never invent figures. When you echo the organization's distinctive phrasing, pull from \`voice_samples\` (prior funded proposals are the strongest signal of what works for this org).

**Org voice takes precedence.** The voice principles above are sensible defaults, not house rules to impose. Where an org's stored \`voice_samples\` reveal a different established style — more formal, more personal, a particular cadence or vocabulary — match the org, not the default. The skill supplies craft and structure; the org supplies voice. Never flatten a distinctive organizational voice into a generic one.

## Citation discipline

Any specific number, named outcome, or quoted organizational claim must trace to a stored entry. When you assert a figure or quote, tag it to its source entry so the citation validator can confirm it. If a needed figure isn't in the substrate, write \`[need: figure]\` rather than fabricating one — a flagged gap is recoverable; a made-up number in a submitted grant is not.

## Do / Don't

Do: localize data, name real programs, mirror funder language, pair numbers with images, write tight active sentences.

Don't: open with the org's history, stack adjectives ("innovative, holistic, transformative"), promise outcomes you can't measure, recycle a generic boilerplate paragraph across funders, or assert "the only/the first/the best" without a citable basis.
`;

/**
 * Registry of all voice skills. Each entry declares which archetypes it applies
 * to and the RegExp triggers that activate it from the user's message.
 *
 * v1: grant-narrative only (development_director). donor-voice + board-comms are
 * deferred to a fast-follow PR — adding them reduces to appending two entries here.
 */
export const VOICE_SKILLS: VoiceSkill[] = [
  {
    id: "grant-narrative",
    archetypes: new Set<ArchetypeSlug>(["development_director"]),
    triggers: [
      /\b(grant|grants)\b/i,
      /\b(proposal|proposals)\b/i,
      /\bLOI\b|\bletter of inquiry\b/i,
      /\b(funder|funders|foundation|foundations)\b/i,
      /\bnarrative section\b/i,
      /\bneed statement\b/i,
      /\blogic model\b|\boutcomes?\b/i,
      /\bsustainability\b/i,
    ],
    addendum: GRANT_NARRATIVE_ADDENDUM,
  },
];

/**
 * Returns the FIRST matching voice skill's addendum string for the given archetype
 * + user message, or "" if no skill matches.
 *
 * Match requires BOTH:
 *   - the archetype is in the skill's `archetypes` set, AND
 *   - at least one trigger RegExp matches the user message (case-insensitive).
 *
 * Cap: one skill per turn (first match wins) to bound Block 2 prompt size.
 *
 * IMPORTANT: This function is called from run-archetype-turn.ts and its result
 * is placed in Block 2 (UNCACHED conditional addendums) — never Block 1 (cached).
 * Keeping it out of the cached block preserves prompt-cache stability across turns.
 */
export function selectVoiceSkillAddendum(
  archetype: ArchetypeSlug,
  userMessage: string
): string {
  for (const skill of VOICE_SKILLS) {
    if (!skill.archetypes.has(archetype)) continue;
    if (skill.triggers.some((re) => re.test(userMessage))) {
      return skill.addendum;
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// D. Frontend Design skill — Marketing Director only
// ---------------------------------------------------------------------------

/**
 * Archetypes that get the Frontend Design system-prompt addendum when the
 * user shows design intent. Marketing Director only, for now.
 */
export const FRONTEND_DESIGN_ARCHETYPES: ReadonlySet<ArchetypeSlug> = new Set<ArchetypeSlug>([
  "marketing_director",
]);

/**
 * Design-intent trigger patterns. Matched against the user message to decide
 * whether to inject the Frontend Design addendum for an eligible archetype.
 *
 * Social content series patterns are included because Marketing Director uses
 * render_design_to_image for every multi-post request — the Frontend Design
 * addendum provides the HTML composition guidance for those graphics.
 */
const FRONTEND_DESIGN_TRIGGER_PATTERNS: RegExp[] = [
  /\b(design|designs|designed|designing)\b/i,
  /\b(mock ?up|mockups?|wireframes?|prototype)\b/i,
  /\bui\b|\bux\b|\buser interface\b|\buser experience\b/i,
  /\b(layout|layouts|composition)\b/i,
  /\b(component|components)\b/i,
  /\b(landing page|landing pages|home page|homepage|splash page)\b/i,
  /\b(brand|branding|visual identity|look and feel|aesthetic|aesthetics)\b/i,
  /\b(hero section|hero banner|cta section)\b/i,
  /\b(website|web page|webpage|site|microsite)\b/i,
  /\b(html|css|tailwind|react component|jsx|tsx)\b/i,
  /\b(palette|color scheme|typography|font pairing)\b/i,
  // Social content series — triggers design guidance for render_design_to_image graphics
  /\b(social\s+media\s+series|social\s+series|content\s+series)\b/i,
  /\b(create|draft|design|make|build|generate)\b.{0,30}\b(\d+|a\s+series\s+of|multiple|three|two|four|five)\b.{0,20}\b(posts?|graphics?|images?|cards?)\b/i,
  /\b(draft|design|create|make)\b.{0,20}\bposts?\b/i,
  /\b(instagram|linkedin|facebook|tiktok)\b.{0,30}\b(post|graphic|card|image|banner|flyer)\b/i,
  /\bsocial\s+(post|graphic|content|card|image)\b/i,
  /\b(event\s+flyer|flyer|poster|banner)\b/i,
];

/**
 * Returns true when the user's message suggests design/frontend intent.
 * Used to decide whether to attach the Frontend Design addendum.
 */
export function shouldAttachFrontendDesign(userMessage: string): boolean {
  return FRONTEND_DESIGN_TRIGGER_PATTERNS.some((re) => re.test(userMessage));
}

/**
 * Frontend Design skill body — mirrors SKILL.md from
 * anthropics/skills/skills/frontend-design/SKILL.md (Anthropic, Apache 2.0).
 * Injected as a system-prompt addendum, not sent via the skills beta API,
 * because the API's `skill_id` enum is limited to docx/xlsx/pptx/pdf.
 */
export const FRONTEND_DESIGN_ADDENDUM = `

## Frontend Design Skill (active for this turn)

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

### Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

### Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

Remember: you are capable of extraordinary creative work. Don't hold back — show what can truly be created when thinking outside the box and committing fully to a distinctive vision.

## Social Media Graphics — Specific Guidance

When creating social media graphics (Instagram posts, LinkedIn banners, event flyers, etc.):

### Composition Rules
- NEVER center everything — use asymmetric layouts, offset text, diagonal flow
- Create clear visual hierarchy: one HERO element (image or headline) dominates 60% of space
- Use maximum 2-3 colors. One dominant, one accent, one neutral.
- Text should be large enough to read on mobile (min 48px for headlines, 24px for body)
- Leave breathing room — at least 15% padding from edges

### Typography for Social
- Headlines: Bold, impactful, maximum 8 words
- Use contrast: if background is dark, text is light (and vice versa)
- Never use more than 2 font families per graphic
- Captions/body text: keep to 2-3 lines max

### Layout Templates to Reference
- **Event Flyer**: Hero image top 50%, event details bottom 50%, CTA button
- **Quote Card**: Large quote centered, author small below, branded border
- **Announcement**: Bold headline top, supporting visual middle, details bottom
- **Instagram Carousel**: Consistent header/footer across slides, varying middle content

### Common Mistakes to Avoid
- Generic stock-photo backgrounds with overlaid text (looks amateur)
- Too many competing elements — if everything is bold, nothing stands out
- Ignoring the platform's aspect ratio constraints
- Using gradients as a crutch instead of actual design thinking
- Clip art or generic icons instead of purposeful graphic elements
`;
