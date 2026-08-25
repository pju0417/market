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

Milestone 1(Headless Economy Simulator) 완료: 실제 생산/도매시장/가게 매입/소매시장/가계·NPC
구매/비용/재고/시장점유율 계산이 규칙 기반 정책으로 7라운드 자동 실행된다. 밸런스 수치는
`src/economy/config.ts`에 모아 둔 v1 baseline이며 최종 확정이 아니다 — 현재 관찰된 밸런스
신호(순이익 마이너스 경향)는 [docs/DECISIONS.md](docs/DECISIONS.md) D-019 참고. UI, 실제
멀티플레이, Google Sheets 연동은 아직 없다. 자세한 범위는 [docs/TODO.md](docs/TODO.md) 참고.

## 개발 명령

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run simulate:smoke
npm run validate:economy
```

## 폴더 구조

```
docs/        설계 문서
src/engine/  라운드 오케스트레이션
src/economy/ 경제 계산 로직 (아직 미구현)
src/npc/     NPC 의사결정 (아직 미구현)
src/advisor/ 규칙 기반 전략 비서 (아직 미구현)
src/multiplayer/ 동시 턴 세션 조율 (아직 미구현)
src/storage/ StorageAdapter 인터페이스 및 구현체
src/types/   공유 타입 정의
src/ui/      프런트엔드 (기술 미확정)
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
