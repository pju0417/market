# CLAUDE.md

이 문서는 Claude Code가 이 저장소에서 작업할 때 항상 지켜야 하는 핵심 원칙을 담는다.
게임의 세부 규칙 전문은 여기 복사하지 않는다. 세부 규칙은 [docs/GAME_RULES.md](docs/GAME_RULES.md),
설계 배경은 [docs/DECISIONS.md](docs/DECISIONS.md)를 참고한다.

## 0. 프로젝트 한 줄 요약

초등학생 대상 시장경제 체험 교육 게임. 학생 1명이 매 라운드 **기업 → 가게 → 가계** 세 역할을
모두 수행하며 생산자·판매자·소비자 관점을 모두 경험한다. 기본 7라운드 구조.
지금 단계는 **게임 기능 구현이 아니라, 이후 반복 개발이 안정적으로 돌아가게 하는 기반 구축**이다.

## 1. 개발 방식 (모든 코드 변경에 적용)

1. 코드를 고치기 전에 관련 구조와 데이터 흐름을 먼저 읽고 분석한다. 추측으로 수정하지 않는다.
2. 요구사항과 현재 구현을 비교해 차이를 명확히 한다.
3. 변경 계획을 세운 뒤 구현한다. 계획 없이 큰 변경을 바로 하지 않는다.
4. 구현 후 반드시 테스트한다 (`npm run typecheck`, `npm test`).
5. 경제 로직에 손을 댔다면 테스트 통과만으로 끝내지 않고 시뮬레이션 결과(`npm run simulate`,
   `npm run validate:economy`)까지 확인한다.
6. "프로그램이 오류 없이 실행된다"와 "게임이 의도한 대로 작동한다"는 서로 다른 검증이다.
   후자를 확인하지 않고 완료로 보고하지 않는다.
7. 오류를 발견하면 증상만 없애지 말고 원인을 분석한 뒤 수정하고, 기존 기능에 미치는 영향을
   확인한다.
8. 이 저장소의 기본 개발 루프는 [docs/DECISIONS.md](docs/DECISIONS.md) 및 아래 4절의
   ARCHITECT → ENGINEER → TESTER → ECONOMY REVIEWER → CODE REVIEWER 순서를 따른다.

## 2. 게임 불변 조건 (임의로 바꾸지 않는다)

- 학생 1명 = 기업 + 가게 + 가계. 세 역할의 자산·손익은 서로 분리되며 임의로 이동할 수 없다.
- 자기 기업 → 자기 가게 직접 거래 금지. 자기 가게 → 자기 가계 직접 구매 금지.
- 기업 → 가게 거래는 도매시장을 통한다 (자동 매칭이 아니라 가게가 직접 비교·선택).
- 모든 라운드는 **기업 턴 → 도매시장 갱신 → 가게 턴 → 소비시장 갱신 → 가계 턴 → NPC 소비자
  처리 → 라운드 정산** 순서로 진행한다. 한 학생이 다른 학생의 턴 종료를 기다리지 않는다
  (역할별로 전원이 동시에 턴을 수행).
- 부족한 시장 참여자는 NPC가 보충한다. NPC는 기본적으로 규칙 기반(deterministic / rule-based
  + 제한적 확률)이며, 학생과 동일한 경제 규칙을 따른다 (무한자산·무료 임대료 등 특혜 금지).
  NPC 배치는 인원수뿐 아니라 업종·상권 쏠림도 고려할 수 있어야 한다.
- 인건비·임대료 등 기본비용은 1라운드부터 존재한다 (3라운드부터 "등장"하는 것이 아니라 심화됨).
- 기업·가게의 위치(상권)는 창업 단계에서 선택하며, 기업에 유리한 입지와 가게에 유리한 입지는
  서로 다르다.
- 업종 변경/확장에는 기존 분야와의 유사도에 따라 추가 비용이 달라진다.
- 전략 비서는 생성형 AI API를 쓰지 않는다. 사전 정의된 규칙과 게임 데이터로만 분석하고, 정답을
  지시하지 않으며 2~3개의 전략 선택지와 각각의 장단점을 제시한 뒤 결정은 학생에게 맡긴다.
  임계값은 하드코딩하지 말고 설정값/규칙 데이터로 관리한다.
- 기본 게임은 7라운드 구조다.
- 경제 엔진(`src/engine`, `src/economy`)은 UI(`src/ui`)와 저장소(`src/storage`)에 의존하지 않는다.
  저장소는 `StorageAdapter` 인터페이스 뒤에 숨기고, 장기적으로 교사별 Google Sheets/Apps Script를
  붙일 수 있도록 분리한다.

## 3. 테스트 원칙

- 경제 로직을 변경하면 단위 테스트 **와** 시뮬레이션 테스트를 모두 수행한다.
- 학생 수가 다른 환경(1명/5명/10명/20명 등, NPC 보충 포함)에서의 동작을 검증한다.
- 데이터 무결성(음수 재고, 자산 초과 지출, 자기 거래 위반 등)을 확인한다.
- 밸런스 이상(특정 전략/업종/상권의 압도적 우위, NPC의 일방적 승리 등)은 버그가 아니라
  "경제 리뷰 대상"으로 별도로 취급하고 [docs/DECISIONS.md](docs/DECISIONS.md)의 4절 절차를 따른다.

## 4. 자동 수정 가능 vs 사용자 승인 필요 (중요)

**자동으로 고쳐도 되는 것**: TypeScript 오류, 명확한 런타임 오류, 원인이 명확한 구현 버그,
잘못된 import, null/undefined 처리 누락, 중복 코드, 데이터 무결성 오류, 명세와 명백히 다른 구현.

**임의로 바꾸지 않는 것** (문제 발견 시 아래 형식으로 먼저 보고하고 승인 후 수정):
수요 계산 공식, 가격 결정 알고리즘, NPC 비율/전략, 상권 효과, 업종 전환 비용, 상품 품질 공식,
승리 조건, 경제 밸런스, 라운드 구조, 시장 규칙, 기타 사용자 경험에 영향을 주는 핵심 게임 규칙.

보고 형식: **문제 상황 → 현재 결과 → 예상 원인 → 가능한 해결책 → 각 해결책의 장단점**.

## 5. 서브에이전트와 개발 루프

역할별 서브에이전트는 [.claude/agents/](.claude/agents/)에 정의되어 있다: `architect`,
`engineer`, `tester`, `economy-reviewer`, `code-reviewer`. 기본 루프는

```
요구사항 → architect(분석/계획) → engineer(구현) → tester(단위/통합/시뮬레이션 테스트)
→ economy-reviewer(경제 규칙·밸런스 검토) → code-reviewer(코드 품질 검토)
→ 문제 있으면 engineer로 되돌려 수정 → 재테스트 → 재검토 → 문제 없으면 완료
```

세부 설명은 [docs/DECISIONS.md](docs/DECISIONS.md)와 각 에이전트 정의 파일을 참고한다.

## 6. 지금 하지 않는 것

전체 게임 UI, 실제 학생 로그인, 실제 Google Sheets 연동/Apps Script 배포, 완전한 NPC 경제
알고리즘, 완전한 전략 비서, 모든 경제 공식, 최종 그래픽, 완성된 멀티플레이는 이번 단계의
범위가 아니다. 다만 이후 구현을 막지 않도록 인터페이스와 폴더 책임은 미리 정의해 둔다
(자세한 로드맵은 [docs/TODO.md](docs/TODO.md) 참고).

## 7. 문서 지도

- [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) — 제품/교육 목표, 대상, 핵심 경험
- [docs/GAME_RULES.md](docs/GAME_RULES.md) — 경제주체, 거래 규칙, 비용, 업종/상권 규칙
- [docs/ECONOMY_ENGINE.md](docs/ECONOMY_ENGINE.md) — 엔진 모듈 구조와 책임 분리
- [docs/ROUND_FLOW.md](docs/ROUND_FLOW.md) — 라운드 진행 순서와 7라운드 커리큘럼
- [docs/NPC_DESIGN.md](docs/NPC_DESIGN.md) — NPC 보충 원칙과 전략 성향
- [docs/ADVISOR_RULES.md](docs/ADVISOR_RULES.md) — 규칙 기반 전략 비서 설계
- [docs/MULTIPLAYER_DESIGN.md](docs/MULTIPLAYER_DESIGN.md) — 동시 턴 멀티플레이 구조
- [docs/GOOGLE_SHEETS_ARCHITECTURE.md](docs/GOOGLE_SHEETS_ARCHITECTURE.md) — 저장소 계층 분리, 장기 배포 구조
- [docs/APPS_SCRIPT_DEPLOYMENT.md](docs/APPS_SCRIPT_DEPLOYMENT.md) — Apps Script Web App 실제 배포 절차(초안, 미검증)
- [docs/DECISIONS.md](docs/DECISIONS.md) — 확정 결정사항(D-001~) 및 변경 이력, 자동수정/승인 절차
- [docs/TODO.md](docs/TODO.md) — 마일스톤 로드맵
