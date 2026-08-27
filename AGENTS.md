# buttonmasher

This repo ships one agent skill: `skills/buttonmasher/SKILL.md`. Any agent that
reads the Agent Skills format (Claude Code, Codex, Copilot CLI, Cursor,
OpenCode, Gemini CLI) can load it from that path; nothing else is required.

When asked to buttonmash, abuse, double-submit, retry, or race-test something,
follow `skills/buttonmasher/SKILL.md` exactly: the moves, the workflow, the
severity labels, the fixing rules, and the report format. Consult
`skills/buttonmasher/references/moves.md` when the target's boundary type is
unfamiliar.

`demo/` is a runnable target with a known double-charge bug; use it to check
that a report matches reality before trusting the skill on real code.
