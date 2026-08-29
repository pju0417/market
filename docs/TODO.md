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

- [x] (사용자 요청, Milestone 4 진행 중 발견) 가계 턴 구매 입력창의 예산 초과 방지를
      "제출 버튼 비활성화"에서 "입력 자체를 실시간으로 제한"으로 강화 — 기존에는 개별
      `<input max=...>`가 그 매물 자신의 재고/전체 개수 한도만 반영해, 여러 매물에 나눠
      담다가 총액이 예산을 넘으면 제출 버튼이 막힐 때까지는 초과 수량을 그대로 입력할 수
      있었다(제출은 항상 막혔으므로 실제로 돈을 초과 지출한 적은 없음 — UX 문제였지 데이터
      무결성 문제는 아니었음). `src/ui/turnCalculations.ts`에 순수 함수
      `computeMaxPurchaseQuantity(listing, totalBudget, maxUnits, otherListingsCost, otherListingsUnits)`
      신규 추가 — 재고, 개수 한도, "다른 매물에 이미 담은 금액/개수를 뺀 나머지 예산" 세
      가지를 모두 반영한 최대 수량을 계산한다. `HouseholdTurnScreen`의 각 입력창이 이
      값을 `max` 속성과 `onChange` 클램프 둘 다에 사용하도록 변경(다른 값을 직접 타이핑해도
      `Math.min(입력값, maxQuantity)`로 즉시 잘림) — 경제 로직/제출 데이터 형식은 무변경,
      기존 `overBudget`/`overUnits` 경고·제출 버튼 비활성화는 방어적 이중 장치로 그대로
      유지. `computeMaxPurchaseQuantity` 단위 테스트 6개 추가(총 265개 통과),
      `typecheck`/`lint`/`build` 클린. 브라우저에서 직접 확인: 한 매물에 담을수록 다른
      매물들의 `max`가 실시간으로 줄어듦, 한도를 넘는 값을 타이핑해도 자동으로 한도까지만
      잘림, 6개 한도까지 담아 제출 시 저축이 정확히 (용돈 100원 − 소비 64원 = 36원)으로
      반영되어 실제 차감 금액에는 영향이 없음을 확인.

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
- [x] NPC 구매 우선순위 역전 수정 (D-025) — `decideHouseholdPurchases`(`src/npc/decisions.ts`)
      내부에서 `household.kind === "npc"`일 때만 `ESSENTIAL_CATEGORY_NPC_PRIORITY_BONUS`를
      적용하고 학생 소유(자동진행 포함)에는 0을 적용하도록 수정(시그니처 변경 불필요 —
      `household-turn`/`npc-consumer-behavior`가 순회하는 household의 `kind`가 생성 시점부터
      고정되어 있음을 확인해 활용). `tests/npc/decisions.test.ts`에 `kind==="student"`이면
      가산점이 걸리지 않음을 결정론적으로 검증하는 테스트 추가. `typecheck`/`lint`/`test`(250개)/
      `build` 통과, `validate:economy` 데이터 무결성 위반 0건. 실측(도매/소매 유통량 직접 계측):
      NPC 가계 1명당 라운드 평균 식품 수령량이 5/10/20명 시나리오에서 각각 5.36→6.81,
      0.24→2.21, 2.98→5.86으로 개선(역전 해소 확인). `householdEssentialCategoriesMissed`의
      "food" 비율 자체는 10/20명에서 오히려 올라간 것처럼 보이는데, 이는 그 지표가 "매물이
      전혀 없어 기회조차 없었던 경우"를 놓침으로 집계하지 않는 정의상 맹점 때문(수정 전엔
      학생이 매 라운드 식품을 100% 소진해 NPC 차례엔 매물 자체가 없었으므로 0%로 보였을
      뿐) — 상세 근거는 docs/DECISIONS.md D-025 참고. code-reviewer·economy-reviewer 모두
      독립 재현으로 문제 없음 확인(economy-reviewer가 D-021엔 영향 없음도 논리적으로 검증).
      economy-reviewer가 검토 중 별개 관찰 하나를 추가 발견: 만족도 페널티 게이팅
      (`wasAvailable`)이 리포팅 지표뿐 아니라 페널티 공식 자체에도 같은 방식으로 적용되어
      "만족도 공식이 같은 라운드 내 처리 순서에 좌우되는" 기존 특성이 있음(D-021엔 무관,
      다인원 실제 플레이에서만 잠재 문제) — D-026(후보)로 기록, 이번엔 손대지 않고
      Milestone 4 다인원 검증 단계로 이월(docs/DECISIONS.md 참고).
- [x] (D-027) 가게 매입 목표 수량이 전략 배율 때문에 정수가 아닌 경우가 발생하던 데이터
      무결성 버그 수정 — `decideStorePurchases`(`src/npc/decisions.ts`)의 `targetQuantity`
      (premium 10.5/low-cost 19.5/aggressive 22.5)와 매입 확정 지점의 `quantity`에
      `Math.floor` 적용(코드베이스 관례상 `Math.round`가 아닌 `Math.floor`). 방어적으로
      `decideCompanyProduction`의 `neededQuantity`에도 동일 적용(현재 배율 조합은 사전 확인
      결과 항상 정수라 수치 영향 없음, 향후 배율 변경 시 재발 방지용). `scripts/validate-economy.ts`
      의 `checkIntegrity`에 기업/가게 재고, 도매/소매 매물 수량의 정수성 검사 추가.
      `tests/npc/decisions.test.ts`에 premium/low-cost/aggressive(재고 0 포함)에서 반환
      `quantity`가 항상 정수임을 검증하는 테스트 추가. 재검증: `typecheck`/`lint`/`test`
      (253개)/`build` 통과. 수정 전 `validate:economy`(1/5/10/20명×시드 1/42/999)는 108건의
      비정수 재고/매물 위반이 실제로 재현됨을 확인했고, 수정 후 0건(음수 검사·determinism
      유지). `simulate:class`(seed 42) 재검증 결과 손익 변동 수 단위~20대, 생존 기업/가게
      수 전 시나리오 무변화, 최대 시장점유율 변동 ±0.01~0.02 — D-025 때 관측된 정상 변동
      범위와 부합해 뚜렷한 방향성 있는 이상 없음. 매입량 실측(재고 0·무제한 자금/공급
      조건): low-cost 19.5→19(-2.6%), premium 10.5→10(-4.8%), aggressive 22.5→22(-2.2%)로
      이론 예측(2~5%대 감소)과 일치. 상세 근거는 docs/DECISIONS.md D-027 참고.
- [x] (Milestone 4 진입 전 처리 권고, code-reviewer 지적) 비서 패널 `useMemo([state, ...])`의
      참조 동일성 문제 — `GameState`는 절대 새 객체로 교체되지 않고 제자리에서 mutate되므로,
      `state` 자체를 의존성으로 쓰면 내용이 바뀌어도 React가 "안 바뀐 값"으로 취급해 재계산을
      건너뛸 수 있다. 지금은 각 턴 화면이 phase 진입마다 통째로 재마운트돼 우연히 문제가
      가려져 있다(`StoreTurnScreen`/`HouseholdTurnScreen`의 기존 `eligible` useMemo도 동일한
      기존 패턴). 동시 턴 멀티플레이(Milestone 4)에서 화면이 마운트된 채로 다른 참가자의
      턴 처리로 상태가 갱신되는 시나리오가 생기면 실제 버그가 될 수 있어, 그 전에
      `session.getVersion()`(원시값) 등으로 의존성을 바꾸는 재검토가 필요하다.
      → 처리 완료: `useGameSession`(`src/ui/useGameSession.ts`)이 `useSyncExternalStore`가
      반환하는 버전 숫자를 `version`으로 그대로 노출하도록 바꾸고, `App.tsx`가 이를
      `CompanyTurnScreen`/`StoreTurnScreen`/`HouseholdTurnScreen`에 `version` prop으로
      전달한다. 세 화면 모두 `state`(또는 `state.wholesaleListings`/`state.retailListings`
      등 하위 필드)를 직접 넣던 `useMemo` 의존성 배열을 `[version, ...id]`로 바꿔
      `session`의 버전 카운터로만 재계산 트리거를 판단하도록 했다(경제 로직·JSX·이벤트
      핸들러는 변경 없음). `typecheck`(양쪽 tsconfig)/`lint --max-warnings=0`/`test`(253개)
      /`build` 모두 통과. 이후 직접 브라우저로 재검증 완료: 기업 턴 생산량 변경 시
      비용 실시간 갱신, 세 턴 화면 모두 비서 패널 정상 동작(1라운드 "지난 실적 없음" →
      2라운드 "지난 라운드 실적과 시장 시세를 함께 참고"로 정확히 전환), 라운드 결과 확인,
      새로고침 → `ResumePromptScreen` → "이어하기" 클릭 시 정확히 같은 지점(손익/거래량까지)
      에서 재개, 2라운드까지 연속 진행 확인. 콘솔 에러 없음. `useGameSession`을 건드린
      부분(재개 경로)까지 포함해 회귀 없음 확인 완료. code-reviewer 검토 결과 문제 없음(버전
      카운터가 모든 상태 변경 경로에서 실제로 증가하는지, `useSyncExternalStore` 스냅샷 재사용이
      concurrent 렌더링 안전성 측면에서 올바른지, 5곳 의존성 배열/eslint-disable 모두 확인).
      권고에 따라 `tests/multiplayer/gameSession.test.ts`에 "모든 mutating 메서드(submit*/
      advancePhase)가 `getVersion()`을 증가시킨다"는 핵심 불변식을 직접 검증하는 가드레일
      테스트 1개 추가(향후 `notify()` 호출이 빠진 새 메서드가 추가돼도 즉시 잡아냄). 254개
      전체 테스트 통과.

## Milestone 4 — 실제 멀티플레이

[MULTIPLAYER_DESIGN.md](MULTIPLAYER_DESIGN.md)의 동시 턴 동기화 구현. architect 로드맵: 1단계
`GameSession` 다인원 코어 리팩터링(네트워크 없음) → 2단계 로컬 폴링 서버 → 3단계 제출
타임아웃/제출현황 UI/담합 방지 → 4단계 다인원 로비 → 5단계 D-026 재검토 → 6단계 안정화.
(D-026은 economy-reviewer 권고에 따라 "5단계" 라벨보다 앞당겨, 4단계 다인원 로비 오픈 전
필수 선행 작업으로 이미 해결책 A로 확정·구현 완료했다 — 아래 항목 참고.)

- [x] **1단계: `GameSession` 다인원 코어 리팩터링 (네트워크 없음)** — architect가 확인한 대로
      갭이 엔진(`src/engine`, `src/economy`, `src/npc`, `src/advisor`)이 아니라
      `GameSession` 한 클래스에 집중돼 있어, 이 파일들은 전혀 건드리지 않고 구현했다.
      - 생성자에 `studentCount: number = 1`을 **마지막 인자**로 추가(기존
        `new GameSession(seed)`/`new GameSession(seed, choices)` 호출 호환 유지).
        `studentCount > 1`이면 `BusinessSetupChoices`는 무시하고 엔진 기본 배정을 그대로
        쓴다(여러 학생 각자의 창업 준비 UI는 다음 단계 — 다인원 로비 — 로 이월).
      - 단일 `humanPlayer` → `humanPlayers: readonly PlayerState[]`(= `state.players`) +
        신규 `getPlayers()`. `getHumanPlayer()`는 `@deprecated`로 남기고 `studentCount>1`이면
        명시적으로 에러를 던진다(첫 번째 학생만 조용히 반환하는 오용을 막기 위해).
      - `pendingCompanyInput`/`pendingStoreRequest`/`pendingHouseholdRequest`(단일 필드)를
        `Map<ParticipantId, ...>` 3개로 교체.
      - `submitCompanyDecision`/`submitStoreDecision`/`submitHouseholdPurchases`가 참가자
        id를 첫 인자로 받도록 시그니처 변경(breaking change, 의도됨) — id가 이 세션의 실제
        학생 소유가 아니면(존재하지 않거나 NPC id면) 에러.
      - `isWaitingForHumanInput()`을 "현재 phase에 필요한 제출 중 하나라도 비어 있으면
        true"로 일반화, 신규 `getUnsubmittedParticipantIds()` 추가(3단계 제출현황/타임아웃
        UI에서 재사용 예정, 이번 단계 UI에서는 미사용).
      - 세 턴 화면의 제출 호출부에 `company.id`/`store.id`/`household.id` 인자만 추가
        (렌더링/로컬 state/UX 무변경), `App.tsx`는 여전히 `studentCount` 없이(=1) 세션 생성.
      - 검증: `typecheck`(양쪽 tsconfig)·`lint --max-warnings=0`·`test`(262개, 기존 24개는
        호출부에 id 인자만 추가하는 순수 시그니처 정합 + 신규 4개)·`build` 모두 통과.
        `simulate:class`/`validate:economy` 수치 완전 동일(헤드리스 시뮬레이터는
        `GameSession`을 쓰지 않으므로 예상대로 무영향, `src/engine`/`src/economy`/`src/npc`/
        `src/advisor` diff 없음으로 재확인).
      - **D-026(후보) 실측 결과**: `tests/multiplayer/gameSession.test.ts`에 seed 1~40
        스윕 테스트로 재현 — 가계 A(항상 희소 필수재를 산다)와 가계 B(그 카테고리를 아예
        요청하지 않는다)가 같은 household-turn에서 경쟁할 때, 시장에 그 카테고리 매물이
        정확히 1개뿐이면 **B가 페널티를 받는지 여부가 순전히 엔진 내부 처리 순서에 따라
        갈리는 것을 실제로 확인**했다: B가 A보다 먼저 처리되면(매물이 아직 있을 때 B의
        `wasAvailable` 스냅숏이 찍힘) 페널티를 받고, A보다 나중에 처리되면(A가 이미
        사가 버린 뒤 스냅숏이 찍힘) 똑같이 못 샀는데도 페널티를 면제받는다. A는 두 순서
        모두에서 항상 구매에 성공한다(B가 그 매물을 건드리지 않으므로). 40개 시드 전부에서
        A의 미충족은 0건, B는 `true`/`false`가 각각 최소 1회 이상 관측됨 — D-026 후보가
        예측한 메커니즘을 다인원 조건에서 처음으로 직접 재현했다. **페널티 공식
        (`src/engine/simulateGame.ts`)은 관찰만 하고 수정하지 않았다** — 조정 여부는
        아래 "5단계"에서 economy-reviewer 검토·사용자 승인을 거쳐 결정한다.
      - **economy-reviewer 추가 실측(시드 1~200 확장)**: B의 부당한 페널티 발생 비율이
        52.5%(true) vs 47.5%(false)로 사실상 동전 던지기 수준임을 확인. 나아가 실제
        학급 규모별 "그 카테고리 매물이 있었는데 못 산" 비율(순서 효과가 작동할 수 있는
        필요조건)을 직접 측정한 결과 **5명 학급에서도 의류(apparel) 기준 92.0%**로 이미
        상시 조건임이 드러났다(식품은 학급 규모에 비례해 2.9%→10.0%→26.7%). 즉 이 문제는
        "먼 미래의 드문 코너케이스"가 아니라 다인원이 켜지는 즉시 거의 매 라운드 나타날
        조건이다 — **"5단계"라는 순서 라벨과 무관하게, 다인원 로비(4단계)로 실제 학생이
        붙기 전에 반드시 해결책을 확정해야 한다**(아래 5단계 항목 갱신 참고). (참고,
        범위 밖 관찰: 의류가 학급 규모와 무관하게 만성적으로 희소한 것 자체는 D-026과
        별개의 기존 공급/수요 밸런스 신호일 수 있음 — 조정 제안 없이 사실만 기록.)
      - **economy-reviewer가 새로 발견한 별개 이슈(참가자 인증 부재)**: `submitCompanyDecision(companyId, input)`
        등은 "이 id가 이 세션 소속 학생 중 하나인가"만 검증하고, **호출자가 실제로 그
        학생 본인인지는 검증하지 않는다**(직접 테스트로 확인: 학생 B의 companyId를 인자로
        넘기면 아무 코드에서나 학생 B 명의로 제출이 성공함). 지금은 네트워크가 없어 같은
        프로세스의 신뢰된 코드만 이 메서드를 호출할 수 있고 `studentCount=1`(D-021)이라
        스푸핑할 다른 학생 id 자체가 없어 실질적 위험은 0이지만, **2단계(로컬 폴링 서버)에서
        여러 기기/탭이 하나의 세션에 요청을 보내게 되면 참가자별 인증(세션 토큰 등) 계층이
        `GameSession` 앞에 반드시 있어야 한다** — 2단계 설계에 필수로 반영.
- [x] **2단계: 로컬 폴링 서버** (같은 기기/네트워크 안에서 여러 브라우저 탭·기기가 하나의
      `GameSession`을 공유하도록 폴링 기반 동기화 — WebSocket 등은 범위 밖). 사용자 확정
      선택지: (1) 서버 진입점은 standalone Node 서버가 아니라 Vite 플러그인
      (`configureServer`/`configurePreviewServer`)으로 `/api`에 마운트, (2) 세션 레지스트리는
      여러 세션을 동시에 들 수 있는 `Map` 기반, (3) 이번 범위는 서버 계층 + 자동화 통합
      테스트까지만이고 `CompanyTurnScreen`/`StoreTurnScreen`/`HouseholdTurnScreen`의 제출
      호출부를 실제 네트워크 호출로 바꾸는 건 4단계(다인원 로비)로 이월, (4) `join` 시
      참가자별 토큰 발급(loose join — 재join해도 매번 새 토큰, 기존 토큰 무효화 없음),
      매 제출에 `Authorization: Bearer <token>` + 토큰이 바인딩된 id와 요청 본문의 id가
      둘 다 일치해야 통과(다른 참가자 명의 제출 시 401/403) — "같은 교실 반신뢰 환경 오남용
      방지" 수준이지 프로덕션 보안은 아님.
      - D-028에서 이미 정한 포지셔닝대로, `httpApi.ts`의 요청 처리 로직을 Node의 raw
        request/response와 완전히 분리된 순수 함수 `handleApiRequest(ApiRequest) =>
        Promise<ApiResponse>`로 구현해, 나중에 Google Apps Script `doPost` 어댑터로 갈아끼울
        수 있게 격리했다(`nodeAdapter.ts`가 유일한 Node 전용 어댑터).
      - 신규 파일: `src/server/tokenStore.ts`(세션별 토큰 발급/조회, `crypto.randomUUID()`,
        새 의존성 없음), `src/server/sessionRegistry.ts`(`Map<sessionId, {session, tokens}>`,
        `createSession(studentCount, rngSeed?)`/`getSession(sessionId)`), `src/server/httpApi.ts`
        (순수 함수, 라우팅 7개: `POST /api/sessions`, `GET .../slots`, `POST .../join`,
        `GET .../state?since=N`, `POST .../submit/{company,store,household}`),
        `src/server/nodeAdapter.ts`(JSON body 스트림 읽기 + URL 파싱만 담당하는 얇은
        `http.RequestListener` 어댑터), `src/server/viteApiPlugin.ts`(위 어댑터를
        `configureServer`/`configurePreviewServer`로 `/api`에 마운트 — connect의 경로 마운트가
        `req.url`을 잘라버리는 것을 피하려고 `server.middlewares.use(path, ...)` 대신 매
        요청마다 `req.url.startsWith("/api")`를 직접 검사하는 미들웨어 사용). `vite.config.ts`에
        `apiPlugin()` 등록.
      - `src/multiplayer/GameSession.ts`에 `advanceUntilInputRequired(force = false):
        Promise<void>` 메서드만 추가(기존 메서드는 시그니처·동작 전혀 무변경) —
        `!isGameOver() && !isWaitingForHumanInput()`인 동안 `advancePhase()`를 반복 호출해
        사람 입력이 필요 없는 phase를 서버가 클라이언트 없이도 끝까지 드레인하게 한다.
        `App.tsx`의 `SILENT_AUTO_PHASES`와 정책은 같지만 그 UI 이펙트 경로는 전혀 건드리지
        않았다. `submit/*`가 성공하면 `httpApi.ts`가 자동으로 `advanceUntilInputRequired(false)`를
        호출한다 — `force=true`를 노출하는 공개 엔드포인트는 이번 단계에 없음(3단계 범위).
      - 담합 방지 원칙 검증: `GET /state`는 `getState()` + `getVersion()` +
        `getUnsubmittedParticipantIds()`만 반환하므로 제출 대기 중인 내용은 응답 어디에도
        실리지 않는다(`GameState`에는 애초에 미확정 제출값이 없음, phase가 실제로 실행된
        뒤의 확정 상태만 담김) — 회귀 테스트로 A가 제출한 직후 B가 폴링한 응답 전체를
        `JSON.stringify`해 A가 제출한 수량/가격 리터럴이 전혀 등장하지 않음을 고정.
      - 검증: `tests/server/httpApi.test.ts` 13개(서버 없이 `handleApiRequest` 직접 호출 —
        세션 생성/조회 실패/slots/join(loose join 포함)/토큰 없는 제출 401/다른 참가자
        명의 제출 403/잘못된 입력 400/`since` 폴링/담합 방지/`advanceUntilInputRequired`
        자동 드레인), `tests/server/integration.test.ts` 2개(`http.createServer(nodeAdapter(...))
        .listen(0)` + Node 전역 `fetch`로 실제 TCP 왕복 — studentCount=2 세션에서 두 가상
        학생이 각자 join → 스푸핑 제출 거부(403) 확인 → 자기 제출 → 폴링 버전 증가 확인 →
        양쪽 제출 후 실제로 phase가 store-turn으로 넘어감 확인 → store/household 턴까지
        진행해 라운드 1이 실제로 정산되고(`roundMetrics.length===1`) 라운드 2 company-turn까지
        automatically 드레인됨을 확인, 두 번째 테스트는 토큰 없는 제출 401 + 없는 세션 404).
        전체 테스트 280개(기존 265개 + 신규 15개) 통과, `npm run typecheck`(양쪽 tsconfig)·
        `npm run lint -- --max-warnings=0`·`npm run build` 모두 클린. `tsconfig.ui.json`
        그래프(`vite.config.ts` → `viteApiPlugin.ts` → `nodeAdapter.ts` → `httpApi.ts` →
        `tokenStore.ts`/`sessionRegistry.ts`까지 전부 transitively 포함됨, TS는 "include"와
        무관하게 import 그래프 전체를 체크하기 때문)에서도 타입 충돌 없음을 실제 확인 —
        `npm run build` 산출물은 65 모듈로 기존과 동일해 서버 코드가 클라이언트 번들에
        섞여 들어가지 않았음도 확인. 추가로 `npx vite`를 백그라운드로 직접 띄워
        `curl`로 `/api/sessions`(201)·`/api/sessions/:id/slots`(200)·존재하지 않는
        세션(404)·`/`(정적 페이지, 200)을 실제로 호출해 Vite 플러그인 마운트 자체가
        실동작함을 수동으로도 확인했다. `src/engine`/`src/economy`/`src/npc`/`src/advisor`는
        전혀 건드리지 않음.
      - code-reviewer 재검증(직접 명령 실행 + git diff로 확인, 눈으로만 안 봄): 위 4개 명령
        모두 재실행해 통과 확인, `GameSession.ts`/`src/engine`·`src/economy`·`src/npc`·
        `src/advisor` 무변경을 `git diff`로 직접 재확인. 인증 우회 경로(타입 강제변환, 대소문자
        비교 등) 없음, 담합 방지 테스트가 실제로 응답 본문을 `JSON.stringify`해 제출값 문자열이
        없는지 확인하는 실질적 검증임을 확인. blocking 이슈 없음. 관찰 2건(둘 다 이번 범위에서
        고치지 않음): (1) `POST /join`은 `playerId`만 알면 토큰을 받을 수 있고 `GET /slots`가
        인증 없이 모든 `playerId`를 노출하므로, "다른 참가자 명의로 제출"은 막아도 "아예 그
        참가자를 사칭해서 join"까지는 못 막는다 — D-028에서 이미 합의한 "같은 교실 반신뢰
        환경" 전제와 일치하는 설계상 선택이라 버그 아님. (2) `sessionRegistry`의 세션 Map에
        만료/정리 로직이 없어 프로세스가 오래 떠 있으면 계속 쌓인다 — 지금 규모(교실 프로토타입,
        프로세스 수명이 짧음)에선 문제 아니고, 나중에(예: 3단계 이후 장시간 운영) 재검토
        대상으로만 기록. 사소한 관찰 1건 추가: `handleSubmit`에서 제출 자체는 성공했는데 직후
        자동 드레인(`advanceUntilInputRequired`) 중 예외가 나면 클라이언트에 일반 500이
        내려간다(데이터 손실은 없음 — 제출은 이미 반영된 뒤라, UX상 에러 메시지가 다소
        불친절할 수 있다는 진단 편의성 관찰일 뿐).
- [x] **3단계: 제출 타임아웃, "누가 아직 제출 안 했는지" 보여주는 UI(확인용), 담합 방지
      재검증** — D-029에서 확정한 대로 타임아웃/강제진행/제출현황은 서버 로직
      (`src/server/`)에만 구현했고, 확인용 클라이언트도 기존 로컬 1인 플레이 경로
      (App.tsx/useGameSession.ts/세 턴 화면)와 완전히 분리된 신규 파일로만 추가했다 — 그
      경로는 한 글자도 안 바꿨다.
      - `src/server/timeoutConfig.ts` 신규: `DEFAULT_SUBMISSION_TIMEOUT_MS = 120_000`
        (v1 잠정값, 경제 밸런스가 아닌 진행 리듬 값이라 `economy/config.ts`가 아닌 서버
        계층 자체 파일에 둠).
      - `src/server/sessionRegistry.ts`의 `SessionEntry`에 `teacherToken`(세션 생성 시
        1회 발급)·`phaseStartedAt`·`lastObservedPhase` 필드와 헬퍼
        `syncPhaseTimer(entry)`(phase가 실제로 바뀌었을 때만 타이머 리셋 — 부분 제출로는
        리셋되지 않음, 반복 제출로 다른 참가자의 타임아웃을 늦추는 것을 방지) 추가.
      - `src/server/httpApi.ts`: `POST /api/sessions` 응답에 `teacherToken`을 1회만 포함
        (다른 라우트에는 절대 노출 안 됨), `POST /api/sessions/:id/force-advance` 신규
        (교사 토큰 불일치/누락 401, 게임 종료 후 no-op 200 `{ok:true, gameOver:true}`),
        `handleState`를 async로 바꿔 `since` 버전 비교보다 **먼저** 타임아웃 체크
        (`checkAndApplyTimeout`: `syncPhaseTimer` → 마감 경과+대기 중이면
        `advancePhase(true)` → `advanceUntilInputRequired(false)` → `syncPhaseTimer`
        재동기화)를 실행하도록 순서를 고정(순서를 반대로 하면 아무도 제출 안 하는 세션은
        `since`가 항상 현재버전과 같아 영원히 `{unchanged:true}`만 반환해 타임아웃이 절대
        발동하지 않는 함정을 architect가 사전에 지적한 그대로 재현할 뻔했음). `handleSubmit`도
        제출 반영 후 `syncPhaseTimer(entry)`를 추가로 호출.
      - 강제진행은 두 지점(자동 타임아웃, 교사 수동 강제진행) 모두 architect가 지정한 순서
        (`advancePhase(true)` → `advanceUntilInputRequired(false)`)를 그대로 따랐다 — "이미
        막혀서 대기 중인 phase에는 force가 적용 안 되는" `advanceUntilInputRequired`의 while
        조건 함정을 피하기 위함.
      - 확인용 클라이언트(신규, 전부 미배선): `src/ui/network/sessionClient.ts`(fetch 주입
        가능한 얇은 래퍼), `src/ui/network/submissionStatus.ts`(순수 함수
        `computeUnsubmittedParticipants`), `src/ui/screens/NetworkSessionMonitor.tsx`(현재
        phase·제출 현황·남은 시간(추정)·교사 토큰이 있을 때만 보이는 "지금 진행" 버튼 —
        4단계에서 재사용 예정이라는 주석만 남기고 `App.tsx` 등에는 배선하지 않음). 토큰은
        `sessionStorage`에 저장(`localStorage` 아님, 탭 간 공유 방지 및
        `LocalStorageAdapter` 고정 키와 충돌 방지).
      - 검증: `tests/server/httpApi.test.ts`에 `vi.useFakeTimers()` 기반 신규 테스트 7개
        (teacherToken 발급/무유출, 플레이어 토큰 force-advance 401·교사 토큰 200,
        force-advance가 미제출 company-turn을 봇 폴백으로 실제로 store-turn까지 뚫는지,
        게임 종료 후 force-advance no-op 200, **순서 버그 회귀 테스트**(폴링 클라이언트가
        `since=자신이 아는 버전`을 마감 경과 후에도 계속 보내도 자동 강제진행된 새 상태가
        반환됨), 마감 직전 실제 제출값이 봇 값이 아니라 사람이 제출한 값 그대로 도매매물에
        반영되는지, 부분 제출·재제출이 `phaseStartedAt`을 리셋하지 않는지).
        `tests/server/integration.test.ts`에 실제 TCP 서버 + `Promise.all`로 두 참가자의
        기업 턴 제출을 동시에 보내는 동시성 테스트 1개 추가(유실·중복 정산 없음, 라운드
        1이 정확히 1건만 정산). 신규 `tests/ui/submissionStatus.test.ts`(DOM 없는 순수
        함수 테스트 5개). 전체 293개 테스트(기존 280 + 신규 13: httpApi 7 + integration 1 +
        submissionStatus 5) 통과, `npm run typecheck`(양쪽 tsconfig)·
        `npm run lint -- --max-warnings=0`·`npm run build`(65 모듈, 신규 UI 파일이 번들에
        섞이지 않음, 어디서도 import 안 됨을 확인) 모두 클린. `src/engine`/`src/economy`/
        `src/npc`/`src/advisor`/`GameSession.ts`는 `git diff`로 무변경 확인 —
        기존 `advancePhase`/`advanceUntilInputRequired`/`isWaitingForHumanInput`/
        `getUnsubmittedParticipantIds`만으로 충분해 `GameSession`에 새 메서드를 추가할
        필요가 없었다. 상세 근거는 docs/DECISIONS.md D-029,
        docs/MULTIPLAYER_DESIGN.md "구현 상태 (Milestone 4 3단계)" 참고.
      - code-reviewer 재검증(직접 명령 실행 + git diff/코드 추적, 눈으로만 안 봄): 위 4개
        명령 재실행 통과 확인(`.only`/`.skip` 없음, 293개 전부 실제로 실행됨도 확인). architect가
        사전에 지적한 9가지 위험 지점(강제진행 호출 순서, 폴링 순서 버그, 타이머 리셋 오남용,
        teacherToken 비노출, force-advance 권한, 담합 방지 회귀, 동시성, 범위 위반 여부,
        sessionStorage 사용) 전부 코드 추적으로 실제 처리됨을 확인 — blocking 이슈 없음.
        비차단 관찰 2건(둘 다 이번 범위에서 고치지 않음): (1) 자동 타임아웃은 서버에 별도
        백그라운드 타이머(`setInterval` 등)가 없어 `GET /state` 폴링 요청이 실제로 들어와야만
        발동한다 — 지금의 Map 기반 프로토타입 서버 구조상 자연스러운 특성이지 회귀는 아니지만,
        향후 폴러가 전혀 없는 상황에서도 타임아웃이 발동해야 한다고 가정하는 단계가 생기면
        재검토 필요. (2) 어떤 참가자의 제출이 마침 그 phase의 타임아웃/강제진행 처리와 정확히
        같은 순간에 도착하면 조용히 유실/덮어써지지 않고 명확한 400("Cannot advance/submit
        while current phase is ...")으로 거부된다 — 데이터 손실은 아니고 정상 동작이지만,
        나중에 실제 제출 UI를 배선하는 단계에서 이 상황을 "너무 늦었습니다" 같은 사용자 친화적
        메시지로 다듬을 가치가 있다는 UX 참고 사항으로만 기록.
- [ ] 4단계: 다인원 로비 — 여러 학생 각자의 창업 준비(상권/업종 선택)를 받는 화면.
      `BusinessSetupChoices`를 다인원용으로 확장하는 설계가 이 단계에서 필요하다.
      (선행 조건이었던 D-026 해결책 확정은 아래 항목대로 이미 완료됨.) 사용자 요청으로
      4-a(서버)/4-b(클라이언트)로 나눠서 진행한다.
  - [x] **4-a: round-result 동기화(ack 게이트) + 로비 타임아웃 상수 + 관련 서버 로직/테스트**
        — D-030에서 확정한 대로, CLAUDE.md 2절의 "한 학생이 다른 학생의 턴 종료를 기다리지
        않는다" 원칙에 국지적 예외를 둔다: round-result phase에서 다음 라운드 company-turn으로
        넘어가는 전환 지점만 전원 확인(ack)을 요구한다(company/store/household-turn의 동시
        처리 원칙은 무영향).
      - architect가 실제 코드를 읽고 확인한 사전 조사대로, `GameSession.ts`의
        `PHASES_REQUIRING_HUMAN_INPUT` 배열은 실제로는 어디에서도 호출되지 않는 죽은
        코드였다(`phaseNeedsHumanInput()`이라는, 자기 자신 말고는 아무도 안 부르는 export
        함수에게만 쓰임) — 실제 게이트는 `getUnsubmittedParticipantIds()`의 switch문이라,
        여기에 `"round-result"` 케이스를 추가하는 방식으로 구현했다(배열에도 정합성 차원에서
        `"round-result"`를 같이 추가).
      - `src/multiplayer/GameSession.ts`: 신규 private 필드
        `acknowledgedRoundResultPlayerIds: Set<ParticipantId>`(제출값이 아니라 확인 여부만
        담음), `getUnsubmittedParticipantIds()`의 switch문에 `"round-result"` 케이스(사람
        플레이어의 `PlayerState.id` 기준, companyId/storeId/householdId 아님), 신규 public
        메서드 `acknowledgeRoundResult(playerId)`(기존 `submit*`와 같은 패턴: phase 불일치·
        비인간/미지 id면 throw), `advancePhase()`가 phase 실행 성공 후 기존
        `pendingCompanyInputs.clear()` 등을 호출하는 지점에 `acknowledgedRoundResultPlayerIds.clear()`도
        추가(매 phase 실행 후 무조건 초기화 — 각자 자기 phase에서만 검사되므로 안전, 다음
        라운드 round-result에서 이전 라운드 ack가 남아있지 않음을 보장). 기존
        메서드(생성자, submit*, advancePhase의 나머지 로직, getVersion 등)는 시그니처·동작
        전혀 무변경.
      - `src/server/httpApi.ts`: 신규 라우트 `POST /api/sessions/:id/acknowledge-round-result`
        (참가자 토큰 인증만 필요 — 토큰이 이미 playerId로 직접 resolve되므로 `submit/*`처럼
        body의 id와 대조하는 로직 불필요, 토큰 없음/미인식 401, phase 불일치 등으로
        `acknowledgeRoundResult`가 throw하면 400, 성공 시 `advanceUntilInputRequired(false)` +
        `syncPhaseTimer` 재동기화 후 200). `checkAndApplyTimeout()` 맨 앞에 예외 추가: 현재
        phase가 `"round-result"`이면 D-029의 120초 자동 강제진행을 건너뛴다(교사의 수동
        force-advance는 이 함수와 무관하게 그대로 유효) — 결과를 읽는 시간에 제출 타임아웃과
        같은 리듬을 강제로 상속시키지 않기 위함(D-030, 정확한 숫자 정책은 이번 범위 밖).
      - `src/server/timeoutConfig.ts`: 신규 상수 `DEFAULT_LOBBY_TIMEOUT_MS = 180_000`(다인원
        로비 대기 타임아웃, 사용자 확정값 — D-030). 이번 4-a에서는 상수만 추가, 실제 사용은
        4-b에서 로비 기능을 만들 때 이어진다.
      - `src/ui/App.tsx`: 예외적으로 이번에 포함(로컬 1인 게임 회귀 방지 필수) — round-result
        화면의 "다음 라운드로" 버튼 콜백을 `session.acknowledgeRoundResult(player.id)` 호출 후
        `advance()`를 부르도록 변경. 이 한 곳 외에 `App.tsx`/`useGameSession.ts`/세 턴
        화면/`src/ui/network/*`/`NetworkSessionMonitor.tsx`는 전혀 건드리지 않았다(4-b 범위).
        `RoundResultScreen.tsx` 자체(props, 렌더링)도 무변경.
      - 검증: `tests/multiplayer/gameSession.test.ts`에 `acknowledgeRoundResult` 신규
        describe 블록 4개(round-result 아닌 phase에서 호출 시 throw, 존재하지 않는
        playerId면 throw, 한 명만 ack해도 대기 유지·전원 ack 후 다음 라운드 company-turn
        진입, 다음 라운드 round-result에서 ack Set이 다시 비어 새로 요구됨). `tests/server/httpApi.test.ts`에
        신규 `acknowledge-round-result` describe 블록 4개(401 무토큰/미인식 토큰, 400 phase
        불일치, 200 정상 ack + 전원 ack 전까지 진행 안 됨 + 전원 ack 후 round 2 company-turn
        진입, round-result에서는 제출 타임아웃 자동 강제진행을 건너뛰되 교사 수동
        force-advance는 여전히 동작함 + 다른 phase는 여전히 자동 강제진행되는 회귀 확인).
        `tests/server/integration.test.ts`: 기존 "household 제출 직후 라운드 2 진입을 기대"하던
        테스트 2건을 수정 — 이제 그 시점엔 `currentPhase==="round-result"`이고
        `currentRound===1`로 멈춰 있음을 먼저 확인한 뒤, 두 참가자 모두의
        `acknowledge-round-result` 호출(한 명만 ack 시 여전히 라운드 1 round-result에 머무는
        것, 둘 다 ack 후 실제로 라운드 2 company-turn으로 넘어가는 것 포함)을 추가해 검증을
        이어가도록 고쳤다. `tests/ui/submissionStatus.test.ts`: "phases outside
        {company-turn, store-turn, household-turn} never map to a participant field"라는
        주석이 이제 사실과 다름을 반영해 갱신(round-result의 `unsubmittedParticipantIds`는
        이제 실제 `PlayerState.id`를 담지만, `computeUnsubmittedParticipants`의
        `PARTICIPANT_ID_FIELD_BY_PHASE`에는 아직 매핑이 없어 여전히 빈 배열을 반환한다는
        점을 명확히 함 — 실제 매핑 추가는 4-b). 전체 테스트 302개(기존 293개 + 신규 9개:
        gameSession 4 + httpApi 4 + submissionStatus 주석만 갱신, integration은 기존 2개
        테스트를 확장) 통과. `npm run typecheck`(양쪽 tsconfig)·`npm run lint --
        --max-warnings=0`·`npm run build`(65 모듈, 기존과 동일해 서버 코드가 클라이언트
        번들에 섞이지 않음) 전부 직접 실행해 클린 확인. `src/engine`/`src/economy`/
        `src/npc`/`src/advisor`는 전혀 건드리지 않았다(`git diff`로 무변경 확인).
      - code-reviewer 재검증(직접 명령 실행 + git diff/코드 추적 + 자체 임시 스크립트로
        런타임 동작까지 직접 재현, blocking 이슈 없음): ack 상태 격리·id 네임스페이스
        (`PlayerState.id`)·phase 가드·라우트 인증(토큰이 이미 playerId로 확정되므로
        `submit/*`와 달리 body id 대조 불필요, 스푸핑 경로 없음)·타임아웃 예외(다른 phase
        회귀 없음, 교사 수동 강제진행 유효)·기존 통합 테스트 수정이 검증을 느슨하게 만든 게
        아니라 오히려 강화했음·범위 위반 없음·`DEFAULT_LOBBY_TIMEOUT_MS` 미사용 export에도
        lint 클린을 전부 코드 추적 + 직접 명령 실행으로 확인. **테스트 커버리지 공백 1건
        발견**: 마지막 라운드(7라운드)의 round-result → gameOver 전환이 실제로 "강제 우회
        없이" 이 ack 게이트에 의존하는지를 검증하는 커밋된 테스트가 없었다(기존 "gameOver에
        도달" 테스트는 전부 `advancePhase(true)`로 게이트 자체를 우회함) — code-reviewer가
        임시 스크립트로 직접 동작은 정상임을 확인했으나(마지막 라운드도 동일 메커니즘으로
        올바르게 gameOver를 발생시킴), 커밋된 테스트가 이를 뒷받침하지 않는다는 지적. CLAUDE.md
        3절 기준 "누락된 테스트 커버리지"는 자동 수정 대상이라 오케스트레이터가 직접
        `tests/multiplayer/gameSession.test.ts`에 신규 테스트("gates the final round's
        game-over transition on real (non-forced) acks, not just force-bypass") 1개를
        추가했다 — 2인 세션으로 라운드 1~6은 매 라운드 실제 ack로 정상 진행시키고, 7라운드
        round-result에서 한 명만 ack했을 때 `advancePhase(false)`가 여전히 reject되는지,
        둘 다 ack한 뒤에야 `gameOver:true`와 `currentRound===8`을 반환하는지, game-over 이후
        `acknowledgeRoundResult` 재호출이 안전한 no-op인지까지 확인. 재검증: 전체 테스트
        303개(기존 302 + 신규 1) 통과, `npm run typecheck`(양쪽 tsconfig)·
        `npm run lint -- --max-warnings=0` 클린. 그 외 code-reviewer가 남긴 사소한 관찰
        1건(`handleAcknowledgeRoundResult`가 `handleSubmit`처럼 `getPlayers().find(...)`를
        먼저 하지 않고 `GameSession` 내부 검증에 그대로 위임하는 비대칭 — 기능적으로 무해,
        향후 인증 모델을 리팩터링할 때 참고)은 이번엔 손대지 않음.
      - 오케스트레이터가 이 세션의 브라우저 도구로 로컬 1인 경로 회귀를 직접 확인(엔지니어
        서브에이전트는 브라우저 도구가 없었음): 저장된 게임을 "이어하기"로 정확히 1라운드
        round-result 화면까지 복원 → "다음 라운드로" 클릭 → 콘솔 에러 없이 정확히 2라운드
        기업 턴으로 진행됨을 확인(가장 회귀 위험이 컸던 지점, `App.tsx`의 새 콜백이 실제
        브라우저에서도 멈추지 않고 정상 동작함을 실측).
  - [x] **4-b 서버 부분: 다인원 로비 엔드포인트(창업 준비 제출/닫기)** — 4-a에서
        `BusinessSetupChoices` 다인원 확장의 서버 쪽이 빠져 있던 것을 채웠다(4-b 클라이언트
        — 조인/로비/네트워크 턴 화면 — 는 이번에도 다루지 않고 이후 별도 진행).
      - `src/multiplayer/GameSession.ts`: 신규 public 메서드
        `applyBusinessSetupChoices(playerId, choices)` — 생성자의 단일 플레이어 전용 로직을
        임의의 학생 1명 단위로 일반화. `currentRound===1 && currentPhase==="company-turn"`일
        때만 허용(그 외 throw), 미지 playerId도 throw. 생성자는 이 메서드를 내부적으로
        재사용하도록 리팩터링(기존 `humanPlayers.length===1` 조건은 그대로 유지) —
        기존 단일 플레이어 생성자 경로는 회귀 없음(테스트로 확인).
      - `src/server/sessionRegistry.ts`: `SessionEntry`에 `lobbySubmittedPlayerIds:
        Set<ParticipantId>`·`lobbyStartedAt: number`·`lobbyClosedByTeacher: boolean` 필드와
        헬퍼 `isLobbyOpen(entry)`(교사가 명시적으로 닫았거나/전원 제출했거나/
        `DEFAULT_LOBBY_TIMEOUT_MS`(180초, D-030에서 이미 확정된 상수)를 초과했으면 닫힘)
        추가.
      - `src/server/httpApi.ts`: `POST /api/sessions/:id/setup`(참가자 토큰 인증, body를
        `src/economy/config.ts`의 기존 `DISTRICT_IDS`/`PRODUCT_CATEGORIES` 상수로 검증 —
        새 상수 신설 없음, 유효하지 않으면 400, `applyBusinessSetupChoices` 실패 시 400, 로비가
        이미 닫혔으면 400, 성공 시 200 + `lobbySubmittedPlayerIds.add`), `POST
        /api/sessions/:id/close-lobby`(교사 토큰 필수, 불일치/누락 401, 성공 시
        `lobbyClosedByTeacher=true`, 재호출해도 안전한 no-op 200) 신규. `handleSubmit`의
        company 제출 경로에 로비가 열려 있으면 400을 반환하는 가드 추가(store/household
        제출에는 가드 불필요 — 기업 턴 이후에나 도달하는 phase임을 통합 테스트로 재확인).
        `handleState`(`GET /state`) 응답에 `lobby: { open, unsubmittedPlayerIds }` 필드 추가.
      - 구현 중 실측한 회귀와 조치: 새 company 제출 가드를 추가하자 기존
        `tests/server/httpApi.test.ts`/`tests/server/integration.test.ts`의 8개 테스트가
        `createTestSession` 직후 로비 처리 없이 바로 `submit/company`를 호출하다 즉시 400으로
        실패하는 것을 실제로 확인했다 — 로비 자체를 검증하려는 의도가 아니었던 테스트들이므로,
        `httpApi.test.ts`의 공유 헬퍼 `createTestSession`에 `closeLobby`(기본값 true) 옵션을
        추가해 세션 생성 직후 교사 토큰으로 로비를 바로 닫도록 했고, `integration.test.ts`의
        두 테스트에도 `close-lobby` 호출 단계를 추가했다(로비 자체를 검증하는 신규 테스트만
        `closeLobby: false`로 열어 둔 채로 받음).
      - **구현 중 발견한 별개의 설계 공백 → code-reviewer가 재현 확인 → 오케스트레이터가 직접
        수정 완료**: 로비 타임아웃(180초)이 제출 타임아웃(120초)보다 길어서, 로비가 실제로
        120초 넘게 걸리면 학생들이 아직 로비 화면에 있는 동안에도 company-turn phase의 제출
        타임아웃 시계는 세션 생성 시점부터 이미 독립적으로 돌고 있어, 로비가 아직 열려있는
        도중에 `GET /state` 폴링이 `checkAndApplyTimeout`을 통해 company-turn을 봇 폴백으로
        강제진행시켜 버리는 버그였다(`checkAndApplyTimeout`은 `round-result`만 예외 처리하고
        로비 중 company-turn은 예외 처리하지 않았음). code-reviewer가 실제 `handleApiRequest`
        호출로 이 버그를 직접 재현해 확인(로비가 열려있다고 응답하는데 실제로는 이미
        store-turn으로 넘어가 있고, 남은 학생들은 이후 `applyBusinessSetupChoices`의 "라운드
        1 기업턴 실행 후" 가드에 걸려 영구히 창업 준비를 할 수 없게 됨). 해결책 A(타임아웃
        예외만 추가, phase 시계는 세션 생성 시점 그대로)와 B(로비가 실제로 닫히는 순간 시계
        자체를 리셋)를 놓고 B로 근본 수정: `sessionRegistry.ts`에 `SessionEntry.lobbyTimerConsumed`
        플래그와 `markLobbyClosedIfNeeded(entry)` 헬퍼 추가(로비가 닫힌 순간 딱 한 번만
        `phaseStartedAt`을 다시 시작, 플래그로 중복 호출 방지). 로비를 실제로 닫는 두 지점
        (`handleSetup`의 마지막 제출, `handleCloseLobby`)에서 그 즉시 호출해 정확한 시점에
        리셋하고, `checkAndApplyTimeout`에도 안전망으로 남겨(아무도 명시적으로 닫지 않고
        시간초과로만 조용히 닫히는 경우 대비) `isLobbyOpen(entry)`이면 무조건 건너뛰도록
        단순화했다. `tests/server/httpApi.test.ts`에 정확히 이 시나리오(로비 130초 경과 →
        아직 열려있고 company-turn 유지 확인 → 교사가 닫음 → 닫힌 직후엔 아직 안 넘어감 →
        닫힌 시점부터 119초 후엔 아직 유지 → 121초 후엔 정상적으로 넘어감)를 재현하는 회귀
        테스트 1개 추가(수정 전 코드로는 이 테스트가 실패함을 직접 확인). 기존
        `DEFAULT_SUBMISSION_TIMEOUT_MS`의 "실제 제출을 봇값으로 덮어쓰지 않는다" 테스트는
        `createTestSession`이 기본으로 로비를 즉시 닫아두는 헬퍼라 이 수정으로 타이밍 가정이
        바뀌어(로비가 닫히는 순간 시계가 리셋되므로) 한 번 실패했다가, 실제로는 테스트 자체가
        올바른 동작을 검증하고 있었음을 확인하고 코드 쪽 수정만으로(테스트 변경 없이) 다시
        통과하게 됨. 전체 테스트 317개(기존 315 + 신규 2: 위 회귀 테스트 1개, 그리고 4-b
        클라이언트 쪽 `submissionStatus` 신규 매핑 테스트 1개) 통과, `npm run typecheck`(양쪽
        tsconfig)·`npm run lint -- --max-warnings=0`·`npm run build`(75 모듈, 4-b 클라이언트
        신규 화면 포함) 모두 직접 실행해 클린 확인.
      - 검증: `tests/multiplayer/gameSession.test.ts`에 `applyBusinessSetupChoices` 신규
        테스트 4개(라운드 1 기업턴이 아닐 때 throw, 미지 playerId throw, 지정한 학생만
        정확히 바뀌고 다른 학생은 그대로임, 기존 생성자 방식 단일 플레이어 경로 회귀 없음).
        `tests/server/httpApi.test.ts`에 신규 describe 블록(`/setup`/`/close-lobby`) 8개
        테스트(401 무토큰, 400 잘못된 상권/업종 id, 200 정상 적용 + 로비가 열려있는 동안
        submit/company 400, 전원 setup 완료 시 로비 자동 닫힘 + submit/company 통과, 로비가
        이미 닫힌 뒤 `/setup` 400, `/close-lobby` 401(무토큰/학생 토큰)·200(교사 토큰)·재호출
        no-op 200, `GET /state`의 `lobby` 필드가 열림/부분제출/닫힘 각 시점에 정확한지, 로비
        타임아웃이 지나면 자동으로 닫히고 submit/company가 통과하는지 — 이 마지막 테스트는
        `vi.useFakeTimers()` 대신 `sessionRegistry.getSession()`으로 `entry.lobbyStartedAt`을
        직접 과거로 돌리는 방식을 썼다, 위 설계 공백과 얽히지 않기 위함). 전체 테스트 315개
        (기존 303 + 신규 12: gameSession 4 + httpApi 8) 통과, `npm run typecheck`(양쪽
        tsconfig)·`npm run lint -- --max-warnings=0`·`npm run build`(65 모듈, 기존과 동일)
        모두 직접 실행해 클린 확인. `src/engine`/`src/economy`/`src/npc`/`src/advisor`는
        `git diff --stat`로 무변경 확인(`src/economy/config.ts`의 기존 `DISTRICT_IDS`/
        `PRODUCT_CATEGORIES`는 읽기 전용으로 import해 재사용만 함). `src/ui/*`는 이번
        작업에서 전혀 건드리지 않았다.
  - [x] **4-b 클라이언트 부분: 다인원 로비 UI 배선(교사 세션 생성/학생 참가/로비 대기/네트워크
        게임 화면)** — D-028/D-029/D-030 및 4-a/4-b 서버 구현 위에, 클라이언트에서 실제로
        로비→게임을 완주할 수 있게 했다. **기존 로컬 1인 플레이 경로는 전혀 손대지 않고
        `App.tsx`의 기존 `App()` 함수 본문 전체를 순수 이동만으로 `LocalGameFlow()`로 옮겼다**
        (`GameScreen` 함수도 무변경으로 같은 파일에 유지) — `git diff`로 실제 순수 이동임을
        확인(유일한 JSX 변경은 바깥 `<div className="app-shell"><header>...` 래퍼를 새
        최상위 `App()`으로 끌어올린 것뿐이며, `onNext`의 `acknowledgeRoundResult` 호출은 4-a에서
        이미 반영된 것을 그대로 유지함).
      - 신규 파일:
        - `src/ui/network/DecisionSubmitter.ts` — 로컬 `GameSession`과 네트워크
          `NetworkDecisionSubmitter`가 공통으로 만족하는 좁은 인터페이스(순수 타입, 반환 타입
          `void | Promise<void>`로 양쪽 모두 구조적으로 만족).
        - `src/ui/network/NetworkDecisionSubmitter.ts` — `DecisionSubmitter`를
          `SessionClient`+`sessionId`+`token`으로 구현하는 얇은 어댑터.
        - `src/ui/network/useNetworkGameSession.ts` — `NetworkSessionMonitor.tsx`가 쓰던
          폴링 패턴(`since` 버전 추적, 3초 간격)을 재사용하는 신규 훅. `useGameSession.ts`
          (로컬 전용, `useSyncExternalStore` 기반)는 전혀 건드리지 않았다.
        - `src/ui/screens/TeacherSessionScreen.tsx` — 학생 수 입력 → 세션 생성 →
          `storeTeacherToken`으로 토큰 저장 → 세션 번호 표시 + `NetworkSessionMonitor` 재사용 +
          "로비 지금 닫기" 버튼.
        - `src/ui/screens/NetworkJoinScreen.tsx` — 세션 번호 입력 → 슬롯 목록 조회 → 슬롯 선택
          → join → 결과를 `sessionStorage`(`economy-game:network-join`)에 저장 후 콜백.
        - `src/ui/screens/NetworkLobbyScreen.tsx` — 미제출 시 기존 `SetupScreen`을 그대로
          재사용(수정 없이 import), 제출 후에는 `useNetworkGameSession`으로 `lobby.open`을
          폴링하며 대기, `lobby.unsubmittedPlayerIds`를 `GET /slots` 결과와 매칭해 "기다리는
          중: OO" 표시, `lobby.open===false`가 되면 `onLobbyClosed()` 호출.
        - `src/ui/screens/NetworkGameScreen.tsx` — `useNetworkGameSession`으로 폴링하며
          phase별로 기존 로컬 턴 화면(`CompanyTurnScreen`/`StoreTurnScreen`/
          `HouseholdTurnScreen`)을 `session={new NetworkDecisionSubmitter(...)}`(useMemo)로
          재사용(`onSubmitted={() => {}}` — 서버가 제출 성공 시 자동으로
          `advanceUntilInputRequired`를 호출하므로 클라이언트가 할 일이 없음), `round-result`는
          `RoundResultScreen` 재사용 + `onNext`에서 `acknowledgeRoundResult` 호출(로컬처럼
          `advance()`를 직접 부를 필요 없음), `gameOver`는 `GameOverScreen` 재사용(`onRestart`는
          `window.location.reload()`로 처음 화면으로 되돌림).
      - 기존 파일 수정:
        - `src/ui/network/sessionClient.ts`: `StateResult`에 `lobby: { open,
          unsubmittedPlayerIds }` 필드 추가(서버가 이미 내려주던 값), `setupBusinessChoices`/
          `closeLobby`/`acknowledgeRoundResult` 메서드 3개 추가(기존 메서드와 동일한 패턴).
        - `src/ui/network/submissionStatus.ts`: `PARTICIPANT_ID_FIELD_BY_PHASE`에
          `"round-result": "playerId"` 추가(D-030에서 실제 `PlayerState.id` 값이 오는 것을
          이제 `PlayerSlot.playerId`로 매핑).
        - `src/ui/screens/{CompanyTurnScreen,StoreTurnScreen,HouseholdTurnScreen}.tsx`: `Props`의
          `session: GameSession` → `session: DecisionSubmitter`로 좁힘(import 교체). 제출
          버튼의 `onClick`을 `Promise.resolve(session.submit*(...)).then(() =>
          onSubmitted()).catch((err) => setSubmitError(...))` 패턴으로 최소 변경(신규
          `submitError` state + 버튼 아래 에러 문구 추가) — 그 외 JSX/로컬 계산/렌더링은
          전혀 건드리지 않았다. 로컬 경로에서는 `GameSession`의 동기 반환값이
          `Promise.resolve()`로 감싸져도 다음 microtask에 `onSubmitted()`가 불리는 것 외에
          동작 차이가 없음을 확인.
        - `src/ui/App.tsx`: 최상위에 `TopMode` 유니언(`mode-select`/`local`/
          `network-role-select`/`network-teacher`/`network-join`/`network-lobby`/
          `network-playing`) 기반의 새 `App()` 함수를 추가하고, 기존 로직은 전부
          `LocalGameFlow()`(순수 이동)와 `GameScreen()`(무변경)에 그대로 유지.
      - 테스트: 새 컴포넌트 자체의 렌더링 테스트는 추가하지 않음(Milestone 2에서 이미 전체
        RTL/jsdom 스위트 도입을 보류하기로 결정한 것을 유지 — 브라우저 E2E 검증은
        오케스트레이터가 직접 수행). `tests/ui/submissionStatus.test.ts`에 round-result
        매핑 검증 케이스 1개 추가(`"round-result": "playerId"` 매핑으로 `unsubmittedPlayerIds`의
        `PlayerState.id`가 올바른 `displayName`으로 매칭되는지), 기존 "매핑 없음" 테스트의
        주석/설명을 갱신(round-result가 이제 실제로 매핑됨을 반영). `DecisionSubmitter`/
        `NetworkDecisionSubmitter`는 순수 얇은 어댑터라 별도 유닛 테스트를 새로 추가하지
        않음(서버 계약은 `tests/server/httpApi.test.ts`/`tests/server/integration.test.ts`가
        이미 검증, `sessionClient.ts` 신규 메서드 3개도 기존 메서드들과 동일한 얇은 패턴이라
        별도 테스트 파일을 새로 만들 필요는 없다고 판단).
      - 검증: 전체 테스트 316개(기존 315 + 신규 1: submissionStatus round-result 매핑) 통과,
        `npm run typecheck`(양쪽 tsconfig)·`npm run lint -- --max-warnings=0`·`npm run build`
        모두 직접 실행해 클린 확인(빌드 75 모듈 — 신규 네트워크 UI 파일들과, 이전까지 어디서도
        import되지 않아 번들에서 제외돼 있던 `sessionClient.ts`/`submissionStatus.ts`/
        `NetworkSessionMonitor.tsx`가 이번에 실제로 `App.tsx`에서 도달 가능해지면서 번들에
        포함됨 — `NetworkSessionMonitor.tsx`가 참조하는 `src/server/timeoutConfig.ts`(순수
        상수 파일, Node 전용 API 없음)도 함께 번들에 포함되는 것을 확인했고, D-029에서 이미
        승인된 패턴이라 별도 문제로 보지 않음). `src/engine`/`src/economy`/`src/npc`/
        `src/advisor`/`src/multiplayer/GameSession.ts`/`src/server/*`/`src/ui/useGameSession.ts`는
        `git diff --stat`로 이번 작업에서 무변경임을 확인(이 커밋 이전 4-a/4-b 서버 작업에서의
        변경만 남아 있음). 로컬 1인 플레이 경로와 네트워크 다인원 경로(2개 탭 시뮬레이션)의
        브라우저 실측 검증은 오케스트레이터가 이어서 수행할 예정.
      - **오케스트레이터의 브라우저 3탭 E2E 검증 완료(교사 1 + 학생 2)**: 세션 생성 → 학생
        2명 참가 → 각자 다른 창업 준비 제출(로비 자동 닫힘 확인) → 기업/가게/가계 턴을 각자
        독립적으로 진행(서로 다른 손익·시장점유율 정상 반영) → 라운드 결과 ack 게이트가
        실제로 "한 명만 확인해선 안 넘어가고 둘 다 확인해야 진행"됨을 확인 → 라운드 2 진입.
        전 과정 콘솔 에러 0건. 이 과정에서 실제 브라우저 전용 버그 1건 발견·수정:
        `SessionClient` 생성자의 `fetchImpl: FetchLike = fetch` 기본값이 `this.fetchImpl(...)`
        형태로 메서드처럼 호출되며 네이티브 fetch가 "Illegal invocation"을 던짐(가짜 fetch를
        주입하는 단위 테스트는 `this` 바인딩을 신경 안 써서 이 버그를 못 잡음) —
        `globalThis.fetch.bind(globalThis)`로 수정, 브라우저 재검증 완료.
      - **code-reviewer 2차 검토가 HIGH 등급 실제 버그 2건을 발견**(이번엔 작업 트리를 직접
        조작하지 말라고 명시해 안전하게 진행): (1) 교사의 `POST /force-advance`가 로비 게이트를
        완전히 우회해, 로비가 열려있어도 강제진행하면 아직 `/setup` 못 낸 학생의 회사/가게가
        엔진 기본값 그대로 실행되고 그 학생은 이후 영구히 `/setup`을 거부당하며, `GET /state`는
        계속 `lobby.open:true`를 거짓으로 보고함. (2) `since` 기반 폴링이 로비 종료를 놓칠 수
        있음 — 로비 상태는 `GameSession` 바깥의 서버 레지스트리 필드라 `GameSession.version`과
        무관한데, `/close-lobby`나 시간초과에 의한 로비 종료는 `GameSession`을 안 건드려
        `notify()`가 안 불림 — `since=<로비 닫히기 전 버전>`으로 폴링하는 학생은
        `{unchanged:true}`만 영원히 받아 로비가 닫힌 사실을 못 봄(전원 제출로 자연히 닫히는
        경로는 문제 없었음, 교사가 명시적으로 닫거나 시간초과인 경우만 문제).
      - **오케스트레이터가 두 버그 모두 직접 수정**: `src/multiplayer/GameSession.ts`에 신규
        public 메서드 `bumpVersion()`(게임 상태는 안 바꾸고 구독자에게만 알림) 추가.
        `src/server/sessionRegistry.ts`의 `markLobbyClosedIfNeeded`가 "이번 호출로 실제 방금
        닫혔는지" `boolean`을 반환하도록 변경. `src/server/httpApi.ts`: `handleCloseLobby`와
        `checkAndApplyTimeout`의 시간초과 안전망 경로가 그 반환값이 `true`일 때만
        `entry.session.bumpVersion()`을 호출(전원 제출 경로는 `applyBusinessSetupChoices`가
        이미 매번 `notify()`를 부르므로 중복 불필요). `doForceAdvance`는 진입 시
        `isLobbyOpen(entry)`이면 먼저 `/close-lobby`와 같은 효과를 적용한 뒤 강제진행을
        이어가도록 수정(교사의 "지금 진행" 클릭을 "로비를 몰래 우회"가 아니라 "로비를 명시적
        으로 닫고 진행"으로 해석). 클라이언트 방어도 병행: `NetworkSessionMonitor.tsx`가
        `stateResult.lobby.open`인 동안 "지금 진행" 버튼을 숨기고 안내 문구로 대체.
        `tests/server/httpApi.test.ts`에 두 버그를 정확히 재현하는 회귀 테스트 2개 추가.
      - MEDIUM 관찰(`NetworkGameScreen`의 round-result 버튼에 중복 클릭 방지가 없어 ack 후
        폴링 지연(최대 3초) 동안 재클릭하면 원문 영어 에러가 노출됨)도 함께 수정: 학생이 ack한
        라운드 번호를 기억해 그 라운드 동안 버튼을 비활성화(실패 시 재시도 가능하도록 되돌림),
        에러 문구도 round-result 블록 안으로 옮겨 phase 전환 후까지 안 남게 함.
      - 오케스트레이터가 브라우저로 직접 재확인: 로비가 열려있으면 "지금 진행" 버튼이 실제로
        안 보이고 안내 문구가 뜨며, "로비 지금 닫기" 클릭 후 네트워크 요청 로그상 폴링이
        `since=0`(닫히기 전 버전)에서 `since=1`(닫힌 후 버전)으로 실제 전환됨을 확인(버전이
        실제로 bump됐다는 직접 증거).
      - 재검증: 신규 회귀 테스트 2개 포함 전체 테스트 319개(기존 317 + 2) 통과, `typecheck`
        (양쪽 tsconfig)·`lint -- --max-warnings=0`·`build`(75 모듈) 모두 클린. LOW 등급 관찰
        2건(join 시 저장하는 `sessionStorage` 값을 아직 아무도 읽지 않는 미완성 재접속 기능,
        `TeacherSessionScreen`이 `NetworkSessionMonitor`와 별개의 `SessionClient`를 만들어
        폴링이 중복되는 사소한 비효율)은 블로킹이 아니라 이번엔 손대지 않고 기록만 함.
- [x] D-026(후보) 해결책 확정 — 사용자가 해결책 A를 승인, 구현 완료. 판정 기준을 "그 라운드
      소매시장 갱신 직후(가계 소비 시작 전) 공급 스냅숏"으로 바꿔 처리 순서 의존성을 구조적으로
      제거했다. `src/engine/simulateGame.ts`의 `RoundAccumulator`에 `roundStartRetailListings`
      필드를 추가해 `runConsumerPurchases`(household-turn/npc-consumer-behavior 공용) 최초
      호출 시점에 한 번만 `state.retailListings`를 얕은 복사해 고정하고, 페널티 판정
      (`wasAvailable`)만 이 스냅숏 기준으로 재계산했다 — 실제 구매 매칭과 페널티 공식(임계값/
      합산/스무딩)은 무변경. `tests/multiplayer/gameSession.test.ts`의 D-026 테스트를 "처리
      순서 무관 결정론적"으로 뒤집어 시드 1~200 전부 통과, `tests/engine/simulateGameMetrics.test.ts`에
      studentCount=2 신규 회귀 테스트 추가(스냅숏 기준으로 정상 페널티 확인), 기존 D-024
      단일가계 손계산 테스트 5개는 예측대로 무수정 통과. 전체 테스트/typecheck/lint/build 통과.
      `simulate:class`(seed 42) 재검증: avgCompanyProfit/avgStoreProfit/생존 기업·가게 수는
      1/5/10/20명 전 시나리오에서 완전 동일, `finalSatisfaction`만 1명 0.46→0.40, 5명
      0.46→0.35, 10명 0.48→0.35, 20명 0.40→0.30으로 하락(0.2 이하로 떨어진 시나리오 없음).
      `validate:economy` 데이터 무결성 위반 0건, determinism 유지. finalSatisfaction 하락
      자체는 새 밸런스 신호이며 추가 조정 없이 수치만 기록(이번 승인 범위 밖). 상세는
      docs/DECISIONS.md D-026 항목 참고.
- [ ] 6단계: 안정화 — 다인원 시나리오 전반 회귀 테스트, 브라우저 수동 검증, 성능/UX 마무리.

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
