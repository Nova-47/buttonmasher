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

---

# 기여하기

가장 도움이 되는 것은 **못 잡은 사례**입니다. 이미 알고 있던 버그를 이 스킬이
못 찾았다면 [이슈로](https://github.com/Nova-47/buttonmasher/issues/new/choose)
알려주세요. 못 잡은 것과 오탐도 잡은 것과 함께 그대로 공개합니다 — 그 정직함이
이 프로젝트의 핵심입니다.

스킬 자체에 대한 기여도 환영합니다 — 더 날카로운 무브, 리포트 형식이 못 담는
경계, `moves.md` 수정. 작게, 스킬의 보이스에 맞게.

### 커밋에 서명해 주세요 (DCO)

이 프로젝트는 [Developer Certificate of Origin](https://developercertificate.org)을
사용합니다. 서류가 아니라 커밋에 붙는 한 줄입니다.

```bash
git commit -s -m "메시지"
```

`Signed-off-by: 이름 <이메일>` 한 줄이 붙습니다. 이 줄은 "내가 작성했거나, 이
프로젝트의 라이선스로 제출할 권한이 나에게 있다"는 확인입니다.

빠뜨렸다면:

```bash
git commit --amend -s
```

이유: 코드 소유 관계를 명확하게 남겨두기 위해서입니다. 나중에 라이선스나 배포
형태를 바꿔야 할 때 모든 기여자를 다시 찾지 않아도 됩니다.

### 스킬이나 데모를 건드렸다면

리포트 형식이 흔들리지 않게 게이트를 돌려주세요:

```bash
node demo/check-report.js demo/report.md
```

<!-- dco install test, delete this branch -->
