# ECONOMY_ENGINE.md

이 문서는 경제 엔진의 모듈 구조와 각 모듈의 책임을 정의한다. Milestone 1부터 실제 경제 공식
(생산/도매/소매/비용/NPC 의사결정)이 구현되어 있다 — 구체 수치는 `src/economy/config.ts`에
모아 둔 v1 baseline이며 최종 밸런스가 아니다 (docs/DECISIONS.md D-018, D-019 참고).

## 설계 원칙

- 경제 엔진(`src/engine`, `src/economy`, `src/npc`, `src/advisor`)은 UI(`src/ui`)와 저장 방식
  (`src/storage`)을 몰라야 한다. 엔진은 순수 함수/클래스로 구성하고, 입출력은 타입으로 정의된
  상태 객체와 액션만 오간다.
- 엔진은 저장소가 메모리인지, localStorage인지, Google Sheets인지 알 필요가 없다. 필요한 경우
  `StorageAdapter` 인터페이스(`src/storage/StorageAdapter.ts`)를 통해서만 상태를 읽고 쓴다.
- 밸런스 관련 수치(임계값, 계수, NPC 비율 등)는 코드에 흩어진 상수로 하드코딩하지 않고, 별도
  설정/규칙 데이터로 분리해 플레이테스트 후 조정할 수 있게 한다.

## 모듈 책임

### `src/types/`
게임 전역에서 공유하는 타입 정의: `Role`(기업/가게/가계), 플레이어/기업/가게/가계 상태,
`RoundPhase`, 상품/카테고리, 상권, 시장(도매/소비) 스냅샷 등. 로직을 포함하지 않는다.

### `src/engine/`
`RoundEngine.ts`는 라운드 진행 오케스트레이션("언제 무엇을 실행하는가")만 책임지는 범용
골격이다. `simulateGame.ts`가 이 골격에 실제 경제 로직을 핸들러로 꽂아 넣는다
([ROUND_FLOW.md](ROUND_FLOW.md)의 라운드 내부 10단계 순서, 11번째 "다음 라운드 시작"은
`RoundEngine.runGame()`이 담당하는 라운드 간 전환).

### `src/economy/`
실제 경제 계산 로직: `config.ts`(카테고리/상권/비용/전략 프리셋 — 모든 밸런스 수치가 모여
있는 단일 지점), `rng.ts`(결정론적 PRNG), `market.ts`(자기 거래 금지 필터, 품질 가중평균),
`settlement.ts`(원장 차감/적립 — 고정비는 capped, 재량 지출은 비-clamp로 버그를 드러냄).

### `src/npc/`
NPC 기업/가게/소비자의 의사결정 로직 (`decisions.ts`) + 인원수·업종 쏠림을 함께 보는 보충
계획 (`backfill.ts`, [NPC_DESIGN.md](NPC_DESIGN.md)). 이 결정 함수들은 진짜 NPC뿐 아니라
Milestone 1의 Headless Simulator에서 사람 입력이 없는 학생 소유 참여자도 자동 진행시키는 데
재사용한다 — Milestone 2에서 실제 입력이 생기면 학생 소유분만 교체하면 된다.

**Milestone 6부터(D-033)**: `MIN_ROUND_FOR_INDUSTRY_ACTIONS`(4)라운드부터 기업의 업종 전환과
가게의 전문 업종 이탈 판매가 실제로 활성화된다. `industrySwitchCost`는 사람(`src/economy/humanDecisions.ts`의
`resolveCompanyIndustrySwitch`)과 NPC(`src/npc/decisions.ts`의 `decideCompanyIndustrySwitch`)
양쪽 경로에서 실제로 호출되며, `specialtyMismatchPenalty`는 가계 구매 알고리즘
(`scoreListingForBuyer`)이 전문 업종을 벗어난 판매 매물의 매력도를 낮추는 데 실제로 쓰인다.
재고 이월 정책은 B안(강제 폐기) — 전환/이탈이 확정되면 재고 유무와 무관하게 즉시 재고·품질을
0으로 리셋한다(보상 없음). 7라운드 커리큘럼의 다른 4~7라운드용 이벤트(경쟁 전략/시장 변화,
[ROUND_FLOW.md](ROUND_FLOW.md))는 여전히 v1 범위 밖이다 — 이번에 활성화된 것은 업종 전환/전문
이탈 판매뿐이다.

### `src/advisor/`
학생에게 상황 설명과 전략 선택지를 제공하는 규칙 기반 분석기가 위치할 자리
([ADVISOR_RULES.md](ADVISOR_RULES.md)). 이번 단계에서는 구현하지 않는다.

### `src/multiplayer/`
동시 턴 세션 조율(누가 턴을 마쳤는지, 언제 라운드를 다음 단계로 넘기는지)이 위치할 자리
([MULTIPLAYER_DESIGN.md](MULTIPLAYER_DESIGN.md)). 이번 단계에서는 구현하지 않는다.

### `src/storage/`
`StorageAdapter` 인터페이스와 최소 구현체(`MemoryStorageAdapter`)를 둔다. 향후
`LocalStorageAdapter`, `GoogleSheetsAdapter`가 같은 인터페이스로 추가된다
([GOOGLE_SHEETS_ARCHITECTURE.md](GOOGLE_SHEETS_ARCHITECTURE.md)).

### `src/ui/`
프런트엔드 코드가 들어갈 자리. 프레임워크는 미확정이며, 엔진에 대한 의존은 있어도 그 반대는
없어야 한다.

## 검증 대상 (economy-reviewer가 확인)

`npm run simulate`, `npm run simulate:class`, `npm run validate:economy`로 실제 수치를 뽑을 수
있다. 코드가 오류 없이 실행되는 것과 별개로, 다음이 실제로 성립하는지 시뮬레이션으로 확인한다
(자세한 지표는 [TODO.md](TODO.md) Milestone 1 절, 현재 관찰된 신호는 [DECISIONS.md](DECISIONS.md)
D-019 참고):

- 학생의 선택이 실제로 시장 결과에 영향을 주는가
- 수요/공급이 비정상적으로 급변하지 않는가
- 특정 전략/업종/상권이 항상 압도적으로 유리하지 않은가
- 소규모 학급에서 NPC 보충이 적절한가 (NPC가 시장을 독식하거나, 반대로 있으나 마나 하지 않은가)
- 독점이 지나치게 쉽게 발생하지 않는가
- 기업/가게/가계 간 편법 자산 이동이 불가능한가
