# TODO.md — 마일스톤 로드맵

## Milestone 0 — 프로젝트 구조 및 루프 엔지니어링 기반 구축 (현재 작업)

- [x] 폴더 구조, 문서 체계, CLAUDE.md, DECISIONS.md 작성
- [x] `.claude/agents/` subagent 구성 (architect, engineer, tester, economy-reviewer, code-reviewer)
- [x] TypeScript + Vitest 기반 초기화
- [x] `StorageAdapter` 인터페이스 + `MemoryStorageAdapter` 최소 구현
- [x] 엔진 오케스트레이션 스켈레톤 (`src/engine`) — 실제 경제 공식 없음
- [x] smoke 시뮬레이션 스크립트/테스트로 개발 환경 정상 동작 확인
- [x] (Milestone 1에서 완료) 실제 경제 로직

## Milestone 1 — Headless Economy Simulator (구현 완료, 밸런스는 조정 대기)

목표: UI/서버 없이 경제 엔진만으로 7라운드를 자동 실행 (`npm run simulate`). **달성.**

- [x] 학생 역할 + NPC 기업/가게/소비자 자동 진행 (규칙 기반 정책, `src/npc/decisions.ts`)
- [x] 생산 → 도매시장 → 가게 매입 → 소매시장 → 가계/NPC 구매 전체 파이프라인
      (`src/engine/simulateGame.ts`)
- [x] 인건비, 임대료, 생산비, 유통비 반영 (`src/economy/config.ts`의 `COSTS`)
- [x] 재고 이월, 수익/누적손익, 라운드별 시장점유율 계산 (`RoundMetrics`)
- [x] NPC 보충이 인원수 + 업종 쏠림을 함께 고려 (`src/npc/backfill.ts`, D-008)
- [x] 결정론적 시드 PRNG로 재현 가능한 시뮬레이션 (`src/economy/rng.ts`)
- [x] 학생 1/5/10/20명 시나리오 자동 테스트 (`tests/simulation/`)
- [x] `npm run validate:economy`가 음수 재고/현금, 재현성을 실제로 검사

검증 지표 (구현 상태):

- [x] 기업/가게 생존율(현금 0 이하 비율), 평균 순이익 — `npm run simulate:class`가 출력
- [x] 시장점유율 분포(최대 점유율) — `npm run validate:economy`가 출력
- [ ] 평균 이익률, 평균 재고율, 상권별/업종별 수익 격차, 가격 폭등/폭락 — 아직 별도 지표로
      뽑지 않음 (RoundMetrics를 이용해 추가 가능, 다음 반복에서 추가)
- [ ] NPC 시장점유율 대 학생 시장점유율 비교 — 아직 별도 집계 없음

**중요한 v1 관찰 사항 (economy-reviewer 검토 대상):** baseline 수치에서 학급 규모와 무관하게
평균 누적손익이 마이너스로 관찰됐다. 자본/고정비 재조정(D-019)으로 생존율은 크게 개선됐지만
(20명 학급 기업 생존 12/20→19/20), 평균 손익 자체는 여전히 마이너스다. 버그는 아님 —
`validate:economy`는 전 시나리오에서 데이터 무결성 위반 0건을 보고한다. 추가 조정 여부는
Milestone 2 실제 플레이테스트로 넘길지 지금 더 다룰지 미결정 (D-019 참고).

감지 대상 이상상황 중 구현됨: 음수 재고, 보유 현금 초과 사용, 자기 거래 제한 위반(구조적으로
불가능하게 설계, `src/economy/market.ts`), 재현성. 아직 미구현: 존재하지 않는 상품 판매/중복
거래 감지(현재 아키텍처상 발생 불가능한 구조라 별도 감지 로직 없음), 무한 자산 증가 감지,
NPC 압승 여부의 정량적 판정.

이후 가능하면 7라운드 × 여러 회 반복, 다양한 NPC 전략/업종 분포/상권 선택 조합 테스트를
`scripts/validate-economy.ts`에 추가한다 (현재는 시드 3개 × 학급규모 4개 = 12개 시나리오).

## Milestone 2 — Local Classroom Prototype

교사 화면, 학생 화면, 기업/가게/가계 턴 UI, 로컬 환경에서 실제 플레이 가능.

## Milestone 3 — 규칙 기반 전략 비서

[ADVISOR_RULES.md](ADVISOR_RULES.md)에 정의된 분석/선택지 로직 구현.

## Milestone 4 — 실제 멀티플레이

[MULTIPLAYER_DESIGN.md](MULTIPLAYER_DESIGN.md)의 동시 턴 동기화 구현.

## Milestone 5 — Google Sheets / Apps Script Adapter

[GOOGLE_SHEETS_ARCHITECTURE.md](GOOGLE_SHEETS_ARCHITECTURE.md)의 `GoogleSheetsAdapter` 구현
및 Apps Script 배포.

## Milestone 6 — UX 개선, 밸런싱, 교육 기능 확장

## 참고: 이번 단계에서 의도적으로 구현하지 않은 것

전체 게임 UI, 실제 학생 로그인, 실제 Google Sheets 연동, Apps Script 배포, 완전한 NPC 경제
알고리즘, 완전한 전략 비서, 모든 경제 공식, 최종 그래픽, 완성된 멀티플레이.
