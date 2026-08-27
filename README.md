# 경제교육 게임 프로젝트

초등학생 대상 시장경제 체험 교육 게임. 학생 한 명이 매 라운드 **기업 → 가게 → 가계** 세
역할을 모두 수행하며 생산자·판매자·소비자 관점을 경험한다. 기본 7라운드 구조.

프로젝트 전체 배경과 규칙, 로드맵은 아래 문서를 참고한다.

- [CLAUDE.md](CLAUDE.md) — Claude Code가 지켜야 하는 핵심 개발 원칙 및 게임 불변 조건
- [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) — 제품 개요
- [docs/GAME_RULES.md](docs/GAME_RULES.md) — 경제 규칙 상세
- [docs/DECISIONS.md](docs/DECISIONS.md) — 확정 결정사항(D-001~)
- [docs/TODO.md](docs/TODO.md) — 마일스톤 로드맵

## 현재 상태

**Milestone 1(Headless Economy Simulator) 완료**: 실제 생산/도매시장/가게 매입/소매시장/
가계·NPC 구매/비용/재고/시장점유율 계산이 규칙 기반 정책으로 7라운드 자동 실행된다. 밸런스
수치는 `src/economy/config.ts`에 모아 둔 v1 baseline이며 최종 확정이 아니다 — 현재 관찰된
밸런스 신호(순이익 마이너스 경향)는 [docs/DECISIONS.md](docs/DECISIONS.md) D-019 참고.

**Milestone 2(Local Classroom Prototype) 완료**: React + Vite UI(D-020)로 학생 1명이 창업
준비 → 기업/가게/가계 턴 → 라운드 결과를 실제로 플레이할 수 있다 (`npm run dev`). 1차 범위는
학생 1명 플레이로 한정한다 (D-021). 새로고침해도 진행 상태가 자동 저장돼 이어할 수 있다
(`LocalStorageAdapter` 연결 완료). 턴 진행 중 언제든 "교사 화면 보기" 토글로 전체 기업/가게
순위와 라운드별 시장 지표 추이를 읽기 전용으로 확인할 수 있다. 사람이 제출한 매입/구매 요청은
`humanDecisions.ts`가 함수 경계에서 소유자 정보로 자기거래를 직접 재검증한다(D-005/D-006
하드닝). Milestone 2 범위의 남은 항목은 없다 — 자세한 이력은 [docs/TODO.md](docs/TODO.md) 참고.

**Milestone 3(규칙 기반 전략 비서) 완료**: `src/advisor/`에 기업 턴(`analyzeCompanyTurn`),
가게 턴(`analyzeStoreTurn`), 가계 턴(`analyzeHouseholdTurn`) 비서를 모두 구현하고 세 턴 화면에
"비서 의견 보기" 패널로 연결했다 — 생성형 AI를 쓰지 않고, 경제 엔진 상태를 순수 함수로 읽어
현재 상황 설명 + 원인 후보 + 3개 전략 선택지(장점/위험)를 만든다. 임계값은 `src/advisor/rules.ts`에
분리해 플레이테스트로 조정 가능하다. D-024로 가계의 "필수 소비" 카테고리(식품>의류 가중치)가
만족도 계산과 NPC 구매 알고리즘에 반영됐다.

## 개발 명령

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run simulate:smoke
npm run validate:economy
npm run dev      # 브라우저에서 실제로 플레이 (Milestone 2 UI)
npm run build    # 정적 배포용 번들 생성
```

## 폴더 구조

```
docs/        설계 문서
src/engine/  라운드 오케스트레이션 (RoundEngine, simulateGame)
src/economy/ 경제 계산 로직 (config, market, settlement, rng, humanDecisions)
src/npc/     NPC/봇 의사결정, 보충 계획
src/advisor/ 규칙 기반 전략 비서 (아직 미구현)
src/multiplayer/ GameSession — phase 진행 제어, 제출 상태 관리 (로컬/1인 범위)
src/storage/ StorageAdapter 인터페이스 및 구현체 (Local은 GameSession.enableAutoSave로 연결됨)
src/types/   공유 타입 정의
src/ui/      React UI (창업 준비~라운드 결과 화면, 교사용 읽기 전용 모니터링 오버레이)
tests/       단위/통합/시뮬레이션 테스트
scripts/     CLI 실행 스크립트 (simulate, validate 등)
.claude/agents/ 역할별 Claude Code subagent 정의
```

## 개발 루프

```
요구사항 → architect(분석/계획) → engineer(구현) → tester(테스트/시뮬레이션)
→ economy-reviewer(경제 규칙·밸런스 검토) → code-reviewer(코드 품질 검토) → 완료
```

자세한 내용은 [CLAUDE.md](CLAUDE.md) 5절과 `.claude/agents/`의 각 에이전트 정의를 참고한다.
