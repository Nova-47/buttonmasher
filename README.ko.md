# buttonmasher

<p align="center"><picture><source media="(prefers-color-scheme: light)" srcset="assets/logo-light.svg"><img src="assets/logo.svg" width="280" alt="buttonmasher 로고"></picture></p>

성급한 사용자가 하는 행동을 에이전트가 대신 해보고, 이중결제·중복주문 같은 버그를 찾는 스킬입니다.
Claude Code 같은 에이전트가 읽는 마크다운 프롬프트 묶음이고, 실행 파일은 아닙니다.

<sub><a href="README.md">English</a></sub>

## 찾는 것

두 가지만 찾습니다.

- **한 번만 일어나야 할 일이 두 번 일어나는 것.** 결제, 주문, 예약, 재고 차감, 쿠폰 사용, 이메일 발송.
- **이미 끝난 일이 다시 일어나는 것.** 취소한 예약이 다시 잡히거나, 만료된 토큰이 통하거나, 끝난 작업이 다시 도는 것.

이런 버그는 코드만 읽어서는 잘 안 보입니다. 코드 자체는 멀쩡하고, 문제는 요청이 들어오는 순서에 있기 때문입니다.
그래서 순서를 직접 밟아봅니다.

- 제출 버튼 연타
- 서버에서는 성공했는데 응답이 늦어서 재시도
- 처리 중 새로고침, 뒤로가기 후 재진입
- 같은 페이지를 탭 두 개에서 동시에
- 같은 웹훅 재전송
- 다단계 플로우에서 중간 단계 건너뛰기

## 결과 예시

[`demo/`](demo/)에 있는 결제 엔드포인트에 한국어로 *"사용자가 결제 버튼을 두 번 누르면 어떻게 돼?"* 라고 물었을 때 실제 출력의 앞부분입니다.

```
BUTTONMASHER

BROKE — 결제 두 번, 주문 두 개

결제 요청 두 개를 cart_1로 동시에 보냈습니다.

checkout()(demo/server.js:47)은 해당 장바구니가 이미 결제됐는지 확인하지
않습니다. 그래서 두 요청이 모두 stripe.createIntent를 멱등성 키 없이 호출하고,
둘 다 db.insertOrder까지 갑니다.

Impact:
한 번 결제한 고객에게서 49.00이 두 번 청구되고, 같은 장바구니로 주문이 두 개 생깁니다.

Smallest fix:
결제 호출에 idempotencyKey: `cart-${cart.id}`를 넘기고 orders(cart_id)에 unique 제약을 겁니다.

Retest:
Reproduced: 모드마다 서버를 띄우고 같은 POST를 두 번 동시에 보낸 뒤 /state를 확인했습니다.
```

서버를 띄울 수 있는 가벼운 레포면 실제로 요청을 두 번 보내 확인하고 `Reproduced`로 표시합니다.
띄울 수 없으면 코드 경로를 따라가 추적하고 `Traced`로 표시합니다. 어느 쪽인지 항상 구분해서 적습니다.
본문은 질문한 언어를 따라가지만, `Impact:` 같은 항목 이름은 영어로 고정입니다.

## 벤치마크 — 이긴 것과 진 것

같은 모델(Claude Fable 5, Claude Code 경유), 같은 도구, 조건당 2회씩 `"이 코드에서 버그 찾아줘"`만 준 경우와 비교했습니다.

| 대상 | buttonmasher | 일반 리뷰 프롬프트 |
|---|---|---|
| cal.com 예약 생성 경로 | **6건** | 0건 |
| fastapi 풀스택 템플릿 | 5건 | **10건** |

상태가 있는 프로덕션 경로에서는 이겼고, 작은 템플릿 레포에서는 졌습니다. 진 쪽에서는 그 레포에서 가장 심각한 버그(비밀번호 복구의 500 응답과 사용자 열거)도 놓쳤습니다.
이긴 cal.com에서도 일반 프롬프트가 잡은 시간대 버그와 보안 우회 하나는 놓쳤습니다.
코드 리뷰를 대체하는 도구가 아닙니다.

단서도 있습니다. cal.com은 인스턴스를 띄우지 못해서 6건 모두 코드 추적(`Traced`)이고, 조건당 2회는 벤치마크라기보다 사례 연구 두 개에 가깝습니다.
프롬프트 원문과 출력 원문은 [`bench/`](bench/)에 그대로 있습니다.

## 하지 않는 것

- **퍼징이 아닙니다.** 깨진 JSON이나 거대한 페이로드는 보지 않습니다.
- **보안 점검이 아닙니다.** 악의적인 공격자를 가정하지 않습니다. 성급할 뿐인 일반 사용자만 가정합니다.
- **테스트 스위트를 만들어주지 않습니다.** 버그 재현용 테스트를 하나쯤 쓸 수는 있습니다.
- **카오스 엔지니어링이 아닙니다.** DB를 죽이거나 네트워크를 끊지 않습니다.
- **큰 리팩터링을 제안하지 않습니다.** 수정이 몇 줄로 끝나면 몇 줄만 고칩니다.

## 심각도

| 라벨 | 의미 |
|---|---|
| **BROKE** | 돈이 잘못 움직였거나, 레코드가 중복·유실됐거나, 잘못된 상태가 저장됨 |
| **FRAGILE** | 지금은 정상이지만 현실적인 재시도·경합이 생기면 BROKE가 됨 |
| **ANNOYING** | 사용 경험은 나쁘지만 데이터는 정상. 언급만 함 |
| **BORING** | 문제 없음 |

아무것도 안 깨지면 짧게 그렇다고만 말하고 코드는 건드리지 않습니다.

## 설치

Claude Code에서 두 줄입니다. 새 세션을 열면 `/buttonmasher`를 쓸 수 있습니다.

```
/plugin marketplace add Nova-47/buttonmasher
/plugin install buttonmasher@buttonmasher
```

Codex / Copilot CLI:

```
codex plugin marketplace add Nova-47/buttonmasher && codex plugin add buttonmasher@buttonmasher
copilot plugin marketplace add Nova-47/buttonmasher && copilot plugin install buttonmasher@buttonmasher
```

Codex는 2026-10-11에 확인했습니다(codex-cli 0.146.0). 위 두 명령으로 설치되고, `demo/server.js`에 돌렸을 때 서버를 직접 띄워 이중 결제를 재현했습니다. Copilot은 아직 검증하지 않았습니다.

`SKILL.md`를 읽는 다른 도구(Cursor, OpenCode, Gemini CLI 등)는 폴더를 복사하면 됩니다.

```bash
git clone https://github.com/Nova-47/buttonmasher
cp -r buttonmasher/skills/buttonmasher ~/.claude/skills/      # Claude Code, 모든 프로젝트
cp -r buttonmasher/skills/buttonmasher .agents/skills/        # Codex / Copilot, 이 프로젝트만
```

훅, 의존성, 설정 파일 없습니다. 실행되는 코드는 `demo/`뿐입니다.

## 사용법

```
/buttonmasher src/api/checkout.ts
/buttonmasher 회원가입 + 이메일 인증 플로우
/buttonmasher src/        # 레포 전체: 위험한 지점 상위 다섯 곳
/buttonmasher             # 현재 diff
```

*"이 엔드포인트 재시도해도 안전해?"* 처럼 말로 물어도 스킬이 켜집니다.
PR 올리기 직전에 diff에 대고 돌리는 용도를 생각하고 만들었습니다.

## 직접 확인해보기

[`demo/`](demo/)는 의존성 없는 Node 18+ 결제 서버와, 같은 요청을 동시에 두 번 보내는 스크립트입니다.

```
node demo/server.js      # 터미널 1
node demo/mash.js        # 터미널 2
```

| 모드 | 결과 |
|---|---|
| 수정 없음 | 주문 2건, 결제 2건 |
| `FIX=1` (orders에 unique 제약만) | 주문 1건, **결제 2건** |
| `FIX=2` (unique 제약 + 결제 멱등성 키) | 주문 1건, 결제 1건 |

`FIX=1`이 많은 사람들이 멈추는 지점입니다. unique 제약은 테이블을 지키지만 결제는 이미 두 번 나간 뒤입니다.

## 기여

가장 도움이 되는 건 **이 스킬이 놓친 버그**입니다. 잡은 사례와 함께 공개합니다.
커밋에는 DCO 서명이 필요합니다(`git commit -s`). 자세한 건 [CONTRIBUTING.md](CONTRIBUTING.md)를 보세요.

## 라이선스

[MIT](LICENSE)
