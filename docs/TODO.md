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

## Milestone 2 — Local Classroom Prototype (핵심 플레이 루프 완성, 세부 마감 남음)

교사 화면, 학생 화면, 기업/가게/가계 턴 UI, 로컬 환경에서 실제 플레이 가능. UI는 **React +
Vite**로 확정 (D-020). 1차 범위는 **학생 1명(사람) 플레이**로 한정한다 (D-021) — 여러 학생이
한 기기를 돌려쓰는 핫시트 다인원 지원은 이번 범위 밖이며, 사람이 제출하지 않는 참여자는 기존
봇 정책(NPC와 동일 경로)으로 자동 진행된다.

- [x] `RoundEngine.stepPhase()` 추가 (기존 `runRound()`/`runGame()`은 변경 없음, 헤드리스
      시뮬레이터 회귀 없음 — 리팩터링 전후 `simulate:class`/`validate:economy` 출력 diff로 확인)
- [x] `src/economy/humanDecisions.ts` — 사람 입력을 봇과 동일하게 clamp/검증 (클라이언트가
      보낸 가격은 신뢰하지 않고 서버 쪽 listing 가격으로 재계산)
- [x] `src/multiplayer/GameSession.ts` — 제출 상태 관리, phase 진행 제어, 소매 판매가격도
      사람이 직접 정할 수 있게 함(`submitStoreDecision`, GAME_RULES.md 1절에 있던 항목이지만
      최초 설계에서 빠져 있던 것을 구현 중 발견해 추가)
- [x] `src/storage/LocalStorageAdapter.ts` 구현 — **다만 아직 `GameSession`/UI에 실제로
      연결(저장/복원)하지는 않았다.** 지금은 브라우저를 새로고침하면 진행 중이던 게임이
      사라진다. 다음 반복 항목으로 남겨둔다.
- [x] 창업 준비(사전 단계) 화면: 상권/업종 선택이 처음으로 사람 입력이 됨 (`SetupScreen`, D-010)
- [x] 기업/가게/가계 턴 폼 UI + 라운드 결과 화면 (기존 `RoundMetrics` 렌더링) — 브라우저에서
      실제로 여러 라운드를 플레이해 확인함(수동 검증, 자동화 테스트 아님)
- [x] `npm run build`로 정적 번들 생성 확인 (서버 없는 배포 목표와 부합, D-020 근거)
- [x] 리팩터링 후 결정론/재현성 회귀 확인: `npm run simulate:class`, `npm run validate:economy`
      출력이 리팩터링 전후 동일함을 diff로 확인함 (테스트 통과만으로 끝내지 않음, CLAUDE.md 1.5~1.6)
- [x] code-reviewer + economy-reviewer 검토 완료 (CLAUDE.md 5절 루프). code-reviewer가
      **critical 버그**를 실제로 재현해 발견: `GameSession.advancePhase()`의 재진입 방지가
      `notify()`보다 늦게 플래그를 지워, 사람이 턴을 제출한 뒤 자동 진행이 첫 조용한
      phase(예: "기업 턴 결과 확정")에서 멈추는 문제 — 수정 완료, 회귀 테스트 추가, 브라우저
      재검증함. economy-reviewer는 자기거래 금지·가격 자유 모두 문제없음 확인, NPC 밸런스
      신호(D-023) 발견·기록.
- [x] D-023 해결(사용자 선택: 해결책 C) — NPC 보충을 카테고리별 최소치로 재설계
      (`minCompaniesPerCategory`/`minStoresPerCategory=2`), 이어서 사용자 지적(D-001: 모든
      참여자가 기업+가게+가계를 함께 함)에 따라 소비자 목표치도 가게 수 기준
      (`consumersPerStore=2.5`)으로 재설계. 학생 1/5/10/20명 재검증: `studentCount=10/20`은
      완전히 동일(회귀 없음), `studentCount=1/5`는 원래 baseline보다 개선(생존율 8/8,
      최대 시장점유율 추가 감소), 데이터 무결성 위반 없음, 재현성 유지, 79개 테스트 통과,
      브라우저 재확인(소매 거래량 약 2배 증가).

- [x] `LocalStorageAdapter`를 `GameSession`에 실제로 연결 — `GameSession.enableAutoSave()`가
      phase 하나가 끝날 때마다(제출 직후가 아니라 확정된 결과만) `window.localStorage`에
      자동 저장한다. 앱 시작 시 저장된 게임이 있으면 `ResumePromptScreen`이 이어하기/새로
      시작하기를 먼저 묻는다. `GameSession.resumeFromState()`로 저장된 `GameState`를 그대로
      이어서 쓴다 (PRNG는 완전히 같은 순서로 이어지진 않지만, 저장 자체는 확정된 상태만
      다루므로 무결성에는 영향 없음 — GameSession.ts 주석 참고). 손상되었거나 스키마가 안
      맞는 저장값, 이미 끝난 게임의 저장값은 조용히 무시/삭제한다. 브라우저에서 실제로
      플레이 → 새로고침 → 이어하기로 정확히 같은 지점(현금/매물까지)에서 재개되는 것을
      확인함. "새로 시작하기" 클릭 시 저장값이 실제로 지워지는 것도 확인함. 6개 테스트 추가.

- [x] 교사 화면(모니터링 전용 읽기 전용 뷰) 구현 — architect 분석 결과 세션 시작 전 라운드 수/시드
      설정은 D-013(7라운드 고정) 제약과 로컬 1인 프로토타입에서의 낮은 실효 가치 때문에 이번
      범위에서 제외. 대신 턴 진행 중 언제든 열어볼 수 있는 읽기 전용 오버레이
      (`TeacherOverviewScreen`)를 추가해 전체 기업/가게 순위(학생+NPC 포함, 누적손익 내림차순)와
      라운드별 시장 지표 추이(도매/소매 거래량·거래액, 평균 가계 만족도)를 노출한다. 새 최상위
      화면을 만들지 않고 `GameScreen`에 토글로 배선했으며, 기존 턴 입력 폼(지역 state 보유)이
      언마운트되어 입력값을 잃지 않도록 `display:none`으로만 숨기는 방식을 사용했다. 순수 읽기
      전용이라 `src/engine`/`src/economy`/`src/npc`/`GameSession`/`domain.ts`는 전혀 건드리지
      않았고(경제 로직 변경 없음 → 시뮬레이션 회귀 확인 불필요), `teacherOverview.ts`(순수
      뷰모델 함수)에 단위 테스트 5개 추가(90개 전체 통과). code-reviewer 검토 통과(읽기 전용
      원칙·언마운트 버그·타입 안전성 문제 없음). 브라우저에서 턴 입력값 유지된 채 토글 여닫기,
      라운드 1 정산 전 "데이터 없음" 안내, 정산 후 순위/지표 정상 반영을 확인함.

- [x] 컴포넌트 단위 자동 테스트 검토 완료 — architect 분석 결과 전체 RTL/jsdom 컴포넌트 스위트
      도입은 보류(실제로 발생했던 유일한 회귀 버그는 이미 세션 레벨 Node 테스트로 더 저렴하게
      커버됐고, 턴 화면의 로컬 계산 버그는 서버 측 `humanDecisions.ts`가 이중 검증하므로
      최악의 피해가 UX 수준에 그침, 새 의존성 3개 + 두 tsconfig 재배선 비용 대비 방어할 리스크가
      작음). 대신 저비용 대안으로 `CompanyTurnScreen`/`StoreTurnScreen`/`HouseholdTurnScreen`의
      파생 계산(예산 초과 여부, 최대 구매 가능 수량, 매입/구매 총액, 구매 수량 합계 등)을
      `src/ui/turnCalculations.ts`(React 비의존 순수 함수)로 추출하고 `tests/ui/turnCalculations.test.ts`에
      경계 케이스(예산 딱 맞음/초과, 단가 0일 때 최대 구매 수량 0, 전문 업종 미지정 시 빈
      목록 등) 포함 26개 단위 테스트 추가 — 새 의존성/설정 변경 없이 기존 vitest 그대로 사용
      (116개 전체 통과). 세 화면의 렌더링/지역 state/JSX는 변경하지 않았고, 계산 로직만
      함수 호출로 치환. 브라우저에서 세 턴 화면 모두 예산 초과/수량 초과 시 경고 문구와
      제출 버튼 비활성화가 정확히 동작하는 것과, 정상 범위에서는 라운드 1 정산까지 문제없이
      진행되는 것을 실제로 확인(콘솔 에러 없음). 재검토 시점: Milestone 4(네트워크 멀티플레이)
      진입 시, `src/ui/` 컴포넌트/조건분기가 크게 늘어날 때, 또는 브라우저 수동 검증으로도
      놓친 컴포넌트 버그가 실제 발생하면.

- [x] (code-reviewer 지적, medium) `resolveStorePurchases`/`resolveHouseholdPurchases` 자기거래
      방어 하드닝 — 두 함수가 companies/stores 소유자 정보로 판매자를 직접 재검증하도록 보강
      (규칙 자체(D-005/D-006)는 변경하지 않고 강제 위치만 함수 경계로 이동). `resolveStorePurchases`는
      `companies: Readonly<Record<ParticipantId, CompanyState>>`, `resolveHouseholdPurchases`는
      `stores: Readonly<Record<ParticipantId, StoreState>>` 파라미터를 새로 받아, 매물이 가리키는
      판매자가 존재하지 않거나(`seller === undefined`, 삭제된 참여자 대비) 구매자와 같은 소유자면
      (`seller.ownerId === store.ownerId` / `household.ownerId`) 그 요청 라인을 조용히 건너뛴다
      (`src/economy/humanDecisions.ts`). 유일한 실제 호출부인 `src/engine/simulateGame.ts`의 두
      호출부에 `state.companies`/`state.stores` 인자만 추가했고 로직은 그대로다.
      `tests/economy/humanDecisions.test.ts`에 기존 정상 케이스는 판매자 소유자를 구매자와 다르게
      만든 테스트용 맵으로 갱신해 회귀 없음을 확인했고, 새로 자기거래(“eligibleListings가
      필터링을 놓쳤다고 가정”해도 거부됨) 2건과 존재하지 않는 판매자 2건 등 4개 테스트를
      추가(총 14개, 전체 120개 통과). `npm run typecheck`(두 tsconfig 모두)·`npm run lint`·
      `npm test`·`npm run build` 모두 통과. `npm run simulate:class`·`npm run validate:economy`는
      하드닝 적용 전후로 수치가 완전히 동일함을 직접 대조 확인(정상 경로에는 영향 없음).

남은 항목 (다음 반복): 현재 없음 — 새 항목이 생기면 여기에 추가한다.

## Milestone 3 — 규칙 기반 전략 비서 (완료)

[ADVISOR_RULES.md](ADVISOR_RULES.md)에 정의된 분석/선택지 로직 구현. **달성.**

- [x] 1단계: 기업 턴 비서 구현 — `src/advisor/{types,rules,companyAdvisor}.ts`. 경제 엔진 상태를
      순수 함수로 읽어 현재 상황 설명 + 원인 후보 + 3개 전략 선택지(장점/위험)를 생성한다.
      선행 작업으로 `RoundMetrics`에 생산량/판매량/매입/매출 계측 필드 7개 추가(경제 공식은
      불변, 순수 계측), `src/ui/turnCalculations.ts`의 비용 계산 함수를 `src/economy/costs.ts`로
      이동(레이어 분리 — advisor가 UI를 참조하면 안 되므로), `src/economy/marketStats.ts` 신규
      (시장 평균가/평균품질, 경쟁자 수). architect 권고에 따라 가게/가계 턴 비서와 UI 연결은
      다음 반복으로 미룸(아래 참고). tester가 학생 1/5/10/20명 × 7라운드 전체 시뮬레이션으로
      크래시/NaN/undefined 노출 없음을 확인, 계측 정확성은 손계산 시나리오로 검증. code-reviewer
      문제 없음(경미한 개선 제안만: 라벨 중복, non-null assertion 패턴 — blocking 아님).
      economy-reviewer가 실제 버그 2건 발견 후 수정 완료: (1) 이월 재고로 판매량이 생산량을
      초과하는 정상 상황(전체 턴의 13~24%)에서 "-4.5개 미판매" 같은 산술적으로 모순된 문구가
      나오던 것을 수정, (2) 수량이 소수로 그대로 노출되던 것을 기존 UI 컨벤션(`Math.round`)에
      맞춤. 임계값/공식 자체는 검증 후 그대로 유지.
      **알려진 한계 (사용자 확인, 임의로 조정하지 않음)**: `highCompetitorCount=3`(`src/advisor/rules.ts`)이
      절대 인원수 기반이라, 학생 1명 세션(D-021, 현재 유일하게 플레이되는 조건)에서는 카테고리당
      경쟁자가 거의 항상 1명뿐이라 "경쟁 인지"/"업종 전환 검토" 조언 축이 사실상 발동하지 않고
      20명 학급에서는 거의 매 턴 발동한다(NPC_TARGETS.minCompaniesPerCategory=2, D-023 구조상
      학급 규모의 계단함수가 됨). 사용자가 "지금 상태 유지"를 선택함 — Milestone 4에서 다인원
      지원이 늘어나면 재검토, 또는 절대 인원수 대신 상대 지표로 재설계하는 옵션이 있었으나
      이번 반복 범위 밖으로 확정.
- [x] 2단계: 가게 턴 비서 구현 — `src/advisor/storeAdvisor.ts`. 1단계와 동일 구조(순수 함수,
      3개 옵션 고정, rng 미사용). 선행 작업으로 `RoundMetrics`에 `storeSupplierCount`/
      `storeTopSupplierSpendShare` 계측 필드 2개 추가(가게별 매입을 기업별로 분해한 것을
      요약만 함, 새 공식 아님), `src/economy/marketStats.ts`에 `computeStoreCompetitorCount`
      추가 및 `computeCategoryAverages` 타입을 일반화해 도매/소매 양쪽에 재사용, 1단계
      code-reviewer가 지적한 라벨 중복을 `src/advisor/shared.ts`로 뽑아 함께 해결. "마진"은
      `StoreState`에 새 원가 추적 필드를 만들지 않고 직전 라운드 매입 총액/수량의 근사치로
      계산. "상권 적합성"은 실제로 `scoreListingForBuyer`(가계의 가게 선택 로직)가
      `DISTRICTS[...].storeSuitability`를 전혀 참조하지 않는다는 기존 문서-코드 불일치를
      architect가 발견해, 인과적 조언("이 상권이라 잘 팔릴 것")으로 쓰지 않고 임대료 배율
      사실 정보로만 노출(수요 공식 자체를 고치는 건 별도 승인 필요 사안으로 범위 밖 확정).
      tester가 손계산으로 공급처 의존도 계측 정확성 검증(기업 A/B 분산 매입 시나리오),
      학생 1/5/10/20명×7라운드 전체 시뮬레이션에서 실제 재고0/매물0건 상황까지 포함해
      크래시 없음 확인, "다양화 검토" 옵션이 대안이 없을 땐(독점) 절대 뜨지 않음을 확인.
      code-reviewer 문제 없음(경미한 관찰만). economy-reviewer도 버그 없음 확인, 1단계
      버그(산술모순 문구·소수 미반올림) 재발 없음 확인.
      **밸런스 관찰 2건 (사용자 확인, 둘 다 "지금 상태 유지" 선택)**:
      (1) `highStoreCompetitorCount=3`도 기업 턴과 동일한 학급 규모 계단함수 재현(이미
      결정된 사안과 같은 성격).
      (2) `highSupplierConcentrationRatio=0.8` 기반 "공급처 편중" 경고가 예상과 반대로
      학생 소유 가게 기준 58~86%라는 매우 높은 빈도로 발동 — `src/npc/decisions.ts`의
      그리디 단일 매물 우선 구매 알고리즘 때문(대안 공급처가 시장에 있어도 실제 분산
      구매로 이어지지 않음). NPC 구매 알고리즘 자체를 바꾸는 건 시장 역학 전반에 영향을
      주는 큰 변경이라 별도 작업으로 분리, 이번엔 임계값도 그대로 유지. 또한 "저마진/적자"
      지표는 봇 자동 플레이에서는 `STORE_STRATEGY_PRESETS.priceMarkup`에 의해 결정론적으로만
      나타나 신호로서의 실효성은 실제 학생 플레이(멀티플레이 연동 이후)로 재검증 필요하다는
      점을 참고로 남김(계산 로직 자체는 올바름).
- [x] 3단계: 가계 턴 비서 구현 — `src/advisor/householdAdvisor.ts`. 1~2단계와 동일 구조.
      **D-024 확정**: "필수 소비" 카테고리를 식품(food)·의류(apparel) 둘 다로 정하되 식품이
      더 중요함을 가중치 2:1로 표현 — (1) 만족도 페널티(food=0.20, apparel=0.10, 매물이
      시장에 있었는데 하나도 못 샀을 때만 각각 독립 판정 후 합산, 0 미만 클램프, 학생/NPC
      공통 경로라 공정하게 적용됨), (2) NPC/자동진행 가계 구매 알고리즘 가산점(food=0.15,
      apparel=0.075, `decideStorePurchases`에는 영향 없음 — `scoreListingForBuyer`에 기본값
      0인 선택 인자로 추가). household 단위 `RoundMetrics` 5개 필드(지출/구매량/카테고리
      수/최대 카테고리 비중/놓친 필수 카테고리 목록) 신규. `resolveHouseholdPurchases`(학생
      직접 입력 경로)는 수정 없음 — 페널티 계산은 구매 방식과 무관하게 공통 적용.
      tester가 만족도 페널티를 5가지 시나리오로 독립 손계산 검증(면제 조건 포함), 학생
      1/5/10/20명×7라운드 통합 시뮬레이션에서 크래시 없음 확인. code-reviewer는 리뷰용
      임시 디버그 파일(`_reviewTemp_simulateGame.ts`) 하나를 지적해 삭제, 그 외 구조/타입
      안전성/id 중복 방지 모두 문제 없음 확인.
      **경제 리뷰 발견 및 결정 사항**:
      (1) NPC 구매 우선순위 가산점이 헤드리스 시뮬레이터의 "학생 소유 자동진행 가계"와 진짜
      NPC 가계에 동일하게 적용되는데, `household-turn`이 `npc-consumer-behavior`보다 항상
      먼저 실행되는 라운드 순서 때문에 다인원(5/10/20명) 시나리오에서는 학생 자동진행이
      희소한 식품을 먼저 선점해 **진짜 NPC의 식품 확보량이 오히려 줄어드는 역전 현상**이
      나타남(economy-reviewer가 독립 재현으로 확인). 다만 **현재 실제로 플레이되는 유일한
      조건(학생 1명, D-021)에서는 의도대로 작동**함이 확인되어, 사용자가 "지금은 그대로
      병합, Milestone 4(다인원 확장) 진입 전 별도 수정"을 선택함 — 해결책은 헤드리스
      시뮬레이터의 학생 자동진행 구매에는 가산점을 적용하지 않도록 호출 경로를 구분하는 것
      (economy-reviewer 권고, NPC 알고리즘 변경이라 별도 승인 필요).
      (2) tester/economy-reviewer가 이번 변경과 무관한 기존 버그를 발견: `BASE_STORE_PURCHASE_QUANTITY`(15)와
      가게 전략별 배율(premium 0.7 등)을 곱하면 정수가 아닌 매입 목표량(예: 10.5)이 나와
      재고/매물 수량에 소수가 전파됨(기업 쪽은 배율 조합이 우연히 항상 정수라 문제 없음).
      `validate:economy`는 정수 여부를 검사하지 않아 지금까지 드러나지 않았음. 이번 PR과
      무관해 별도 백로그로 분리(아래 참고).
      전체 249개 테스트 통과, typecheck/lint/build 클린, `validate:economy` 데이터 무결성
      위반 없음, 손익/생존율은 이번 변경과 무관하게 유지(만족도만 변화, 설계 예측 범위 내).
- [x] UI 연결 완료 — 세 턴 화면(`CompanyTurnScreen`/`StoreTurnScreen`/`HouseholdTurnScreen`)
      모두에 "비서 의견 보기" 토글 카드 추가. `src/ui/screens/AdvisorPanel.tsx`(신규,
      `{ advice: TurnAdvice }`만 받는 순수 프레젠테이션 컴포넌트)가 데이터 가용성 안내,
      상황 요약, 원인 후보(빈 배열이면 중립 문구로 대체), 3개 전략 선택지(장점/위험 2열,
      모두 동일한 스타일 — 어느 하나도 추천처럼 강조하지 않음)를 렌더링한다. 기존 결정 폼
      JSX/로직은 한 글자도 안 바꾸고 그 뒤에 형제 카드로만 추가(교사 오버레이의 `display:none`
      방식과 달리, 비서 패널 자체가 상태 없는 컴포넌트라 조건부 렌더링만으로 충분 — architect
      사전 판단대로 폼 입력값 유지가 구조적으로 보장됨). 브라우저에서 세 화면 모두 실제로
      확인: 토글 열고 닫아도 입력값(생산량 등) 유지, 1라운드 "참고할 지난 실적 없음" 안내와
      2라운드 "지난 라운드 실적과 시장 시세를 함께 참고" 안내가 각각 정확히 표시, 1단계에서
      고쳤던 이월재고 문구("42개 생산, 이월 재고 포함 총 17개 판매")도 2라운드에서 산술
      모순 없이 정상 표시, 콘솔 에러 없음. 경제 로직 변경이 전혀 없는 순수 UI 배선이라
      시뮬레이션 회귀 확인 불필요, 기존 249개 테스트 그대로 통과. 새 RTL/jsdom 컴포넌트
      테스트는 추가하지 않음(Milestone 2에서 이미 "저비용 대안만" 채택 확정). 이로써
      Milestone 3(규칙 기반 전략 비서: 기업/가게/가계 턴 + UI 연결)가 모두 완료됨.
- [ ] (Milestone 4 진입 전 처리 권고) NPC 구매 우선순위 역전 수정 — 헤드리스 시뮬레이터의
      학생 자동진행 구매(`decideHouseholdPurchases` 호출)에는 `ESSENTIAL_CATEGORY_NPC_PRIORITY_BONUS`를
      적용하지 않도록 호출 경로 구분. 지금은 D-021(학생 1명) 조건에는 영향 없어 보류 중.
- [ ] (별도 이슈, 이번 Milestone 3와 무관) 가게 매입 목표 수량이 전략 배율 때문에 정수가
      아닌 경우가 발생(`src/npc/decisions.ts`의 `BASE_STORE_PURCHASE_QUANTITY`×`purchaseQuantityMultiplier`).
      `Math.floor`/`Math.round` 적용 검토, `validate:economy`에 정수 검사 추가 검토.
- [ ] (Milestone 4 진입 전 처리 권고, code-reviewer 지적) 비서 패널 `useMemo([state, ...])`의
      참조 동일성 문제 — `GameState`는 절대 새 객체로 교체되지 않고 제자리에서 mutate되므로,
      `state` 자체를 의존성으로 쓰면 내용이 바뀌어도 React가 "안 바뀐 값"으로 취급해 재계산을
      건너뛸 수 있다. 지금은 각 턴 화면이 phase 진입마다 통째로 재마운트돼 우연히 문제가
      가려져 있다(`StoreTurnScreen`/`HouseholdTurnScreen`의 기존 `eligible` useMemo도 동일한
      기존 패턴). 동시 턴 멀티플레이(Milestone 4)에서 화면이 마운트된 채로 다른 참가자의
      턴 처리로 상태가 갱신되는 시나리오가 생기면 실제 버그가 될 수 있어, 그 전에
      `session.getVersion()`(원시값) 등으로 의존성을 바꾸는 재검토가 필요하다.

## Milestone 4 — 실제 멀티플레이

[MULTIPLAYER_DESIGN.md](MULTIPLAYER_DESIGN.md)의 동시 턴 동기화 구현.

## Milestone 5 — Google Sheets / Apps Script Adapter

[GOOGLE_SHEETS_ARCHITECTURE.md](GOOGLE_SHEETS_ARCHITECTURE.md)의 `GoogleSheetsAdapter` 구현
및 Apps Script 배포.

## Milestone 6 — UX 개선, 밸런싱, 교육 기능 확장

- [ ] 4~7라운드 커리큘럼 차별화(사업 확장/경쟁 전략/시장 변화) — Milestone 2까지는 전 라운드가
      동일 규칙으로 진행되며, 이는 Milestone 2의 미완성이 아니라 애초에 이 단계 범위 밖이다
      (CLAUDE.md 6절, docs/ROUND_FLOW.md 참고)

## 참고: 이번 단계에서 의도적으로 구현하지 않은 것

전체 게임 UI, 실제 학생 로그인, 실제 Google Sheets 연동, Apps Script 배포, 완전한 NPC 경제
알고리즘, 완전한 전략 비서, 모든 경제 공식, 최종 그래픽, 완성된 멀티플레이.
