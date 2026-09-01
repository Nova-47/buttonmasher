# Contributing

Field reports are the most useful thing you can send — especially the misses.
If you ran it and it failed to find a bug you already knew about, [open an
issue](https://github.com/Nova-47/buttonmasher/issues/new/choose). Misses and
false positives get published alongside the catches; that honesty is the whole
point of this project.

Changes to the skill itself are welcome too — a sharper move, a boundary the
report format doesn't cover, a fix to `moves.md`. Keep it small and in the
skill's voice.

### Sign your commits (DCO)

This project uses the [Developer Certificate of Origin](https://developercertificate.org).
It's one line, not a form to sign.

```bash
git commit -s -m "your message"
```

That appends `Signed-off-by: Your Name <your@email>` to the commit. By adding it
you're saying: you wrote this, or you have the right to submit it under the
project's license.

Forgot on your last commit?

```bash
git commit --amend -s
```

Why bother: it keeps ownership of the codebase unambiguous, so the project can
change how it's licensed or distributed later without having to track down every
contributor. Nothing more sinister than that.

### If you touched the skill or the demo

Run the format gate so a report change doesn't drift:

```bash
node demo/check-report.js demo/report.md
```

