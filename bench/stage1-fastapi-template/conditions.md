# Stage 1 — fastapi/full-stack-fastapi-template

Purpose: validate the harness and scoring before the production-code stage.
Target: https://github.com/fastapi/full-stack-fastapi-template @ 486f054,
`backend/` (25 Python files: login, users, items, password recovery, email).

Both conditions: same machine, same day, same model (the session default),
headless `claude -p`, `--allowedTools "Read,Grep,Glob,Bash"` (no Write),
run from a fresh shallow clone. n=2 per condition, independent processes.

Condition A (bare prompt), clone WITHOUT the skill anywhere:

    claude -p "Review this code for bugs a real user would hit; report what you find. Target: backend/. Do not modify files." --allowedTools "Read,Grep,Glob,Bash"

Condition B (buttonmasher v1.1.5 copied to .claude/skills/ in the clone):

    claude -p "/buttonmasher backend/" --allowedTools "Read,Grep,Glob,Bash"

Raw outputs: run-a1.md, run-a2.md, run-b1.md, run-b2.md (unedited).
Scoring: every distinct claim was verified against the code by hand and
labeled real / plausible-unverified / false positive. The comparison table
is in README.md next to this file.
