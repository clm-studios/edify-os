These files are the authored source-of-truth for the addendum constants embedded in
`../registry.ts`. Authored by Minervamon. The provenance test in
`../__tests__/skill-provenance.test.ts` enforces byte-equality between each source
file's body (everything below the YAML frontmatter) and its corresponding registry
constant. When updating a skill, edit both the source file and the embed together.
