# DECISIONS.md

이 문서는 프로젝트의 확정된 설계 결정사항과 변경 이력을 기록한다.
**Claude는 이 문서에 기록된 결정을 임의로 변경해서는 안 된다.** 변경이 필요하다고 판단되면
[CLAUDE.md](../CLAUDE.md) 4절의 보고 형식(문제 상황 → 현재 결과 → 예상 원인 → 가능한 해결책 →
장단점)으로 먼저 보고하고, 사용자 승인 후에만 이 문서를 갱신한다.

## 확정 결정사항

| ID | 결정 | 상태 |
|----|------|------|
| D-001 | 학생 한 명은 기업/가게/가계 세 역할을 모두 가진다. | 확정 |
| D-002 | 세 역할(기업/가게/가계)의 자산과 손익은 분리한다. 임의 이동 금지. | 확정 |
| D-003 | 기업→가게 거래는 도매시장 방식이다 (자동 매칭 아님). | 확정 |
| D-004 | 가게는 여러 기업의 상품을 가격·품질·수량 등으로 직접 비교해 매입한다. | 확정 |
| D-005 | 자기 기업 → 자기 가게 직접 거래를 금지한다. | 확정 |
| D-006 | 자기 가게 → 자기 가계 직접 구매를 금지한다. | 확정 |
| D-007 | 부족한 시장참여자는 NPC가 보충한다. | 확정 |
| D-008 | NPC 수는 플레이어 수뿐 아니라 업종·시장 상황(쏠림)도 고려할 수 있다. | 확정 |
| D-009 | 인건비와 임대료 등 기본비용은 1라운드부터 적용한다. | 확정 |
| D-010 | 기업과 가게의 위치(상권)를 창업 단계에서 선택한다. | 확정 |
| D-011 | 업종 변경에는 기존 분야와의 유사도에 따라 추가비용이 발생한다. | 확정 |
| D-012 | 전략 비서는 생성형 AI가 아니라 규칙 기반으로 구현한다. | 확정 |
| D-013 | 기본 게임은 7라운드 구조다. | 확정 |
| D-014 | 경제 엔진과 저장소(Storage)를 분리한다. | 확정 |
| D-015 | 장기 멀티플레이 저장 구조는 교사 소유 Google Sheets + Apps Script 방식을 목표로 한다. | 확정 |
| D-016 | 초기 기술 스택: TypeScript + Node.js, 테스트는 Vitest, 스크립트 실행은 tsx. UI/서버 프레임워크는 미확정. | 확정 (근거는 아래 참고) |
| D-017 | 저장소(git) 초기화는 이번 초기 구축 단계에서 수행하되, 커밋은 사용자가 명시적으로 요청할 때만 생성한다. | 확정 |
| D-018 | Milestone 1의 수요/가격/비용/NPC 파라미터는 `src/economy/config.ts`에 모아 둔 **v1 baseline**으로 구현한다 (하드코딩 산재 금지). 구체 수치는 최종 밸런스가 아니라 플레이테스트로 조정될 잠정값이다. | 확정 (수치는 잠정, 아래 D-019 참고) |
| D-019 | v1 baseline 그대로 시뮬레이션하면 학급 규모(1/5/10/20)와 무관하게 평균 순이익이 마이너스이고 라운드가 진행될수록 도매/소매 거래량이 줄어드는 경향이 나타난다. 데이터 무결성 위반(버그)은 아니며(`npm run validate:economy` 전 시나리오 통과), 밸런스 신호로 기록만 하고 임의로 재조정하지 않는다. | 기록됨 — 조정 여부는 사용자 결정 대기 |
| D-020 | D-016의 UI 프레임워크를 **React + Vite**로 확정한다 (근거는 아래 D-020 절 참고). Redux/Zustand 등 별도 UI 상태관리 라이브러리는 쓰지 않는다 — `GameSession`(경제/엔진 계층)이 유일한 진실 공급원이고 UI는 `useSyncExternalStore`로 구독만 한다. | 확정 |
| D-021 | Milestone 2(Local Classroom Prototype) 1차 범위는 **학생 1명(사람)만 플레이**하는 것으로 한다. 여러 학생이 한 기기를 돌려쓰는 "핫시트" 다인원 지원은 이번 범위에 넣지 않는다 — 제출하지 않는 나머지 참여자는 기존 봇 정책(NPC와 동일 코드 경로)으로 자동 진행된다. | 확정 (사용자 선택, 구조적으로 다인원 확장을 막지 않음) |
| D-022 | 초기 architect 계획에는 없었지만 구현 중 발견: 가게의 "판매가격"은 GAME_RULES.md 1절이 명시한 핵심 결정 항목인데, 최초 엔진 설계는 이를 항상 매입원가×전략 마크업으로 자동 계산해 사람이 정할 방법이 없었다. `GameSession.submitStoreDecision`에 `retailPrice`를 추가해 사람이 직접 정할 수 있게 했다 (값을 안 주면 기존 자동 계산 유지, 봇 경로는 영향 없음). | 확정 (구현 중 발견한 설계 공백 수정) |
| D-023 | economy-reviewer가 Milestone 2 검토 중 발견한 "카테고리당 NPC 1개→복점/독점" 문제(원인: 전체 최소치가 카테고리 수와 우연히 같았음)를 해결책 C로 수정: NPC 보충 기준을 `minCompanies/minStores`(전체 최소치)에서 `minCompaniesPerCategory/minStoresPerCategory=2`(카테고리별 최소치)로 재설계. 후속으로 사용자 지적에 따라 소비자 목표치 기준도 학생 수(`consumersPerStudent`)에서 실제 가게 수(`consumersPerStore`)로 바꿔, 판매자가 늘어난 만큼 소비자도 함께 늘도록 함 — 모든 참여자가 기업+가게+가계를 함께 한다는 D-001 원칙을 NPC에도 적용. 학생 1/5/10/20명 전 시나리오 재검증 완료: 시장점유율 개선, 손익 baseline 이상으로 회복, 회귀 없음. | 확정 (사용자 선택: C, 소비자 연동 후속 수정 포함) |
| D-024 | 가계의 "필수 소비" 카테고리를 식품(food)·의류(apparel) 둘 다로 정하되, 식품이 의류보다 더 중요하다는 것을 가중치 차등으로 표현한다. (1) 만족도 페널티: food=0.20, apparel=0.10을 roundSatisfaction에서 차감(매물이 시장에 있었는데 하나도 못 샀을 때만, 두 카테고리 독립 판정 후 합산, 0 미만 클램프). (2) NPC/자동 진행 가계 구매 알고리즘(scoreListingForBuyer): food=0.15, apparel=0.075를 점수에 가산(decideStorePurchases에는 영향 없음). 두 체계는 스케일이 달라 독립 상수로 관리하되 상대 비율은 2:1로 통일했다. v1 잠정값(플레이테스트로 조정 가능). | 확정 (사용자 지시) |
| D-025 | D-024 후속 수정: NPC 구매 우선순위 역전 해결(docs/TODO.md 239~241행 항목). `ESSENTIAL_CATEGORY_NPC_PRIORITY_BONUS`가 호출자 구분 없이 전원에게 적용되어, 헤드리스 시뮬레이터에서 학생 자동진행(`household-turn`, 항상 `kind==="student"`)이 진짜 NPC(`npc-consumer-behavior`, 항상 `kind==="npc"`)보다 먼저 처리되며 희소한 식품을 선점하는 역전이 발생했다. `decideHouseholdPurchases`(`src/npc/decisions.ts`) 내부에서 `household.kind === "npc"`일 때만 가산점을 적용하고 학생 소유(자동진행 포함)에는 0을 적용하도록 수정(시그니처 변경 없음, `scoreListingForBuyer`/`resolveHouseholdPurchases`/`runConsumerPurchases` 무변경). 검증: `npm run typecheck`(양쪽 tsconfig)·`lint`·`test`(250개)·`build` 모두 통과. `simulate:class`(seed 42) 재실행 결과 1/5명은 수치 불변, 10명은 avgStoreProfit -304.7→-266.0·finalSatisfaction 0.48→0.47, 20명은 companies survive 20→19·avgCompanyProfit -376.9→-359.2로 미세 변동(가계 쪽 변경이므로 기업/가게 손익·생존율 실질적 불변 확인됨). `validate:economy`(1/5/10/20명×시드 1/42/999) 데이터 무결성 위반 0건, determinism 유지. 실제 식품 확보량(도매/소매 로그를 직접 계측, 5/10/20명×시드 1~5/42/999 합산)은 NPC 가계 1명당 라운드 평균 수령량이 5명 5.36→6.81, 10명 0.24→2.21(약 9배), 20명 2.98→5.86으로 세 시나리오 모두 뚜렷이 개선됨 — 수정 의도(역전 해소)가 실질적으로 달성됨을 확인. 단, 기존 `roundMetrics[r].householdEssentialCategoriesMissed`의 "food" 포함 비율만 보면 10/20명 시나리오에서 오히려 악화된 것처럼 보이는데(예: 10명 0%→5.3%), 원인은 이 지표의 정의상 맹점이다 — 수정 전에는 식품이 학생 턴에서 매 라운드 100% 소진되어 NPC 턴이 오기도 전에 매물 자체가 사라졌으므로 `wasAvailable`이 항상 false가 되어 "놓침"으로 집계조차 되지 않았고(실제로는 NPC의 식품 획득량이 0에 가까웠는데도 0% 리포트), 수정 후에는 학생이 식품을 전부 쓸어가지 않아 일부가 NPC 턴까지 남게 되면서 비로소 그 부족(여전히 공급 대비 수요가 큼)이 "놓침"으로 정상 관측되기 시작한 것 — 즉 지표가 나빠 보이는 것은 실제 악화가 아니라 이전에 가려져 있던 문제가 드러난 것이다. 이 지표의 맹점 자체는 이번 수정 범위 밖(경제 로직/지표 정의 변경은 승인 필요)이라 손대지 않았고, 원 데이터(실제 식품 유통량)로 교차 검증해 실질 개선을 확인했다. | 확정 (사용자 승인된 방향의 구현) |
| D-026 | economy-reviewer가 D-025 검증 중 발견: 필수 소비 미충족 만족도 페널티(D-024)의 `wasAvailable` 판정은 **리포팅 지표뿐 아니라 만족도 페널티 공식 자체**를 게이팅한다(`simulateGame.ts` 같은 if문 안에서 `missedEssentialCategories`와 `essentialPenalty` 둘 다 결정). 이 판정은 "그 라운드에 애초에 공급이 있었는가"가 아니라 "그 가계 차례가 왔을 때 마침 남은 재고가 있었는가"만 본다 — 즉 만족도 공식 자체가 같은 라운드 내 처리 순서에 좌우된다. 학생 1명(D-021)에는 영향 없음(경쟁자가 없어 항상 신선한 재고를 봄), 하지만 다인원 실제 플레이(D-022 이후 여러 실제 학생이 같은 household-turn 안에서 경쟁하는 경우)에서는 처리 순서가 늦은 학생/NPC가 필수재를 실제로 못 샀어도 페널티를 면제받는 불공정이 생길 수 있다. 데이터 무결성 위반은 아니고 D-025가 만든 문제도 아니다(원래 있던 특성, D-025는 발생 빈도를 은폐→노출로 바꿨을 뿐). (후보 단계에서는) 이번엔 손대지 않고 기록만 함 — 다인원 플레이 검증 단계(Milestone 4)에서 재검토. **최종 해결책: 해결책 A(사용자 승인) 채택 및 구현 완료.** 판정 기준을 "그 라운드 소매시장 갱신 직후(가계 소비 시작 전) 공급 스냅샷"으로 바꿔 가계 처리 순서와 무관하게 결정론적으로 만들었다. `src/engine/simulateGame.ts`: `RoundAccumulator`에 `roundStartRetailListings: RetailListing[] | null` 필드 추가(라운드 시작 시 `freshAccumulator()`가 `null`로 초기화, `runCompanyTurn`에서 매 라운드 리셋), `runConsumerPurchases`(household-turn/npc-consumer-behavior 공용) 최초 호출 시점에 그 자리에서 한 번만 `state.retailListings`를 얕은 복사해 채운다. 페널티 판정(`wasAvailable`)만 이 스냅샷 기준 `eligibleRetailListingsForHousehold(household, roundStartListings, state.stores)`로 바꾸고, 실제 구매 매칭(`eligible`, 실시간 `state.retailListings` 기준)과 페널티 공식(임계값 0.20/0.10, 합산, 스무딩)은 전혀 건드리지 않았다. 검증: `typecheck`(양쪽 tsconfig)·`lint --max-warnings=0`·`test`(259개)·`build` 모두 통과. `tests/multiplayer/gameSession.test.ts`의 D-026 테스트를 "처리 순서와 무관하게 항상 같은 결과"로 뒤집어 시드 1~200 전부에서 가계 A(항상 미충족 0건), 가계 B(항상 `true`, `outcomes.size===1`)를 확인. `tests/engine/simulateGameMetrics.test.ts`에 studentCount=2 신규 회귀 테스트 추가: household-turn에서 학생 가계가 유일한 식품 매물을 소진해도 이어지는 npc-consumer-behavior의 다른 가계(식품 미요청)가 `householdEssentialCategoriesMissed`에 "food"를 포함함을 확인(라이브 재고는 0인데도 스냅샷 기준으로 정상 페널티). 기존 D-024 단일가계(studentCount=1) 손계산 테스트 5개는 architect 분석대로 코드 수정 없이 그대로 통과(단일 가계 시나리오라 스냅샷과 라이브 값이 우연히 같음). `simulate:class`(seed 42) 재검증: avgCompanyProfit/avgStoreProfit/생존 기업·가게 수는 1/5/10/20명 전 시나리오에서 수정 전후 완전 동일(가계 쪽 판정 시점만 바꿨으므로 당연한 결과) — finalSatisfaction만 1명 0.46→0.40, 5명 0.46→0.35, 10명 0.48→0.35, 20명 0.40→0.30으로 하락(모두 처리 순서 유불리로 부당하게 페널티를 면제받던 가계가 이제 정당하게 페널티를 받게 된 결과). 0.2 이하로 떨어진 시나리오는 없음(가장 낮은 값 0.30, 10/20명). `validate:economy`(1/5/10/20명×시드 1/42/999) 데이터 무결성 위반 0건, determinism 유지 확인. finalSatisfaction 하락 자체는 새 밸런스 신호이며 이번 승인(판정 시점 변경) 범위 밖이므로 추가 조정 없이 수치만 보고. **후속 수정(code-reviewer 발견)**: 위 구현이 실제로는 411행에서 `roundStartListings`(스냅샷)이 아니라 `state.retailListings`(라이브)를 그대로 넘기고 있어 스냅샷 변수가 죽은 코드였고, D-026이 고치려던 순서 의존성이 실제로는 해결되지 않은 채 `lint --max-warnings=0`(미사용 변수 경고)과 신규 회귀 테스트 2개가 실패하는 상태로 "완료" 보고됐던 것을 code-reviewer가 라인 단위 검토로 적발. 인자를 `roundStartListings`로 교체하는 한 줄 수정으로 해결(다른 로직 무변경). 수정 후 재검증: `lint`/`test`(259개, 문제의 회귀 테스트 2개 포함) 전부 통과, `tests/multiplayer/gameSession.test.ts`의 D-026 시드 스윕과 `tests/engine/simulateGameMetrics.test.ts`의 신규 회귀 테스트로 직접 재확인. `simulate:class`(seed 42) 재실행 결과 finalSatisfaction 수치(1/5/10/20명: 0.40/0.35/0.35/0.30)는 수정 전 버그 상태에서 보고됐던 값과 우연히 동일(이 버그가 해당 seed의 다수 가계·다양한 공급량 시나리오에서는 통계적으로 미미한 차이만 만들고, 정확히 이를 겨냥한 소수 가계·희소 매물 1개 시나리오에서만 뚜렷이 드러나는 종류의 버그였기 때문 — code-reviewer가 시드 1~200 스윕에서 `outcomes.size`가 실제로 2(버그)→1(수정)로 바뀌는 것으로 직접 확인). `validate:economy` 데이터 무결성 위반 0건, determinism 유지 재확인. | 확정 |
| D-027 | 데이터 무결성 버그 수정(승인 불필요, CLAUDE.md 4절 자동수정 대상): `decideStorePurchases`(`src/npc/decisions.ts`)의 `targetQuantity = Math.max(0, targetStockLevel - store.inventoryQuantity)`가 `BASE_STORE_PURCHASE_QUANTITY(15) × purchaseQuantityMultiplier`(premium 0.7 → 10.5, low-cost 1.3 → 19.5, aggressive 1.5 → 22.5) 조합에서 소수가 되어, 이 값이 그대로 매입 수량으로 쓰이며 도매 재고·소매 매물·가계 구매 수량까지 소수가 전파되는 버그였다. `Math.floor`를 적용해 수정(기존 코드베이스 관례상 수량 계산은 전부 `Math.floor`만 쓰고 `Math.round`는 쓰지 않음, "목표량은 상한" 설계 의도와도 일치). 매입 확정 지점(`Math.min(remainingTarget, listing.quantityAvailable, affordable)`)에도 방어적으로 `Math.floor`를 추가해 향후 다른 배율 조합에서 재발하지 않도록 이중 안전장치를 뒀다. `decideCompanyProduction`의 동일 패턴(`neededQuantity`)에도 방어적으로 `Math.floor`를 추가했는데, 현재 `BASE_PRODUCTION_QUANTITY(20)`과 기존 전략 배율(1.0/1.3/0.7/1.5/0.6) 조합은 사전 확인 결과 전부 정수( 20/26/14/30/12)라 수치상 영향은 없다. `scripts/validate-economy.ts`의 `checkIntegrity`에 `company.inventoryQuantity`·`store.inventoryQuantity`·`wholesaleListings[].quantityAvailable`·`retailListings[].quantityAvailable`의 정수성 검사를 추가(기존 음수 검사와 같은 위반 목록 스타일). `tests/npc/decisions.test.ts`에 premium/low-cost/aggressive(재고 0 포함) 전략에서 반환 `purchases[].quantity`가 항상 `Number.isInteger`임을 검증하는 테스트 추가. 검증: `typecheck`(양쪽 tsconfig)·`lint`·`test`(253개, 기존 `stable` 전략 테스트 포함 전부 통과)·`build` 모두 통과. 수정 전 `validate:economy`(1/5/10/20명×시드 1/42/999)는 108건의 비정수 재고/매물 위반이 실제로 재현됐고, 수정 후에는 0건(음수 검사·determinism도 그대로 유지). `simulate:class`(seed 42, 1/5/10/20명) 재검증 결과 avgCompanyProfit -232.3→-233.4/-489.4→-491.2/-399.4→-406.0/-357.6→-380.0, avgStoreProfit -237.2→-215.2/-221.1→-216.0/-263.9→-250.6/-302.0→-295.0, finalSatisfaction 0.45→0.46/0.47→0.46/0.47→0.48/0.38→0.40, 생존 기업/가게 수는 전 시나리오에서 변화 없음(1/5명 8/8·8/8, 10명 9/10·10/10, 20명 20/20·20/20 그대로), `validate:economy`의 최대 도매/소매 점유율 변동폭은 ±0.01~0.02 수준 — D-025 때 관측된 정상 변동 범위(수십 단위 손익, ±0.01~0.03 점유율, 생존자 1명 이내)와 부합해 뚜렷한 방향성 있는 이상은 관측되지 않았다. 매입량 실측(`decideStorePurchases`를 재고 0, 자금/공급 무제한 조건으로 직접 호출): stable 15, low-cost 19.5→19(-2.6%), premium 10.5→10(-4.8%), aggressive 22.5→22(-2.2%), conservative 9 — 이론 예측(2~5%대 감소)과 정확히 일치, 모든 전략에서 반환 수량이 정수임을 확인. | 확정 (데이터 무결성 버그, 승인 불필요 — 재검증 결과 정상 범위) |
| D-028 | Milestone 4 2단계("로컬 폴링 서버") 설계 중 재검토: Google Sheets/Apps Script를 최종 저장소로 쓸 계획(D-015)이라면, Apps Script Web App(`doPost`/`doGet`)이 사실상 "여러 클라이언트가 하나의 세션에 접근"하는 서버 역할을 이미 대신하므로 로컬 서버가 중복 설계가 되는 게 아니냐는 질문이 나옴. 사용자가 B안 채택: 로컬 서버를 폐기 대상이 아니라 **"Apps Script Web App으로 포팅될 프로토타입"**으로 명확히 포지셔닝해 계속 진행한다. 근거: (1) 실제 Google 계정/시트/Apps Script 배포는 사용자의 직접 관여가 필요하고 배포 주기가 느려 멀티플레이 프로토콜(참가자 인증/제출/폴링 API 형태) 자체를 처음부터 그 환경에서 설계·디버깅하는 건 비효율적이다. (2) architect 설계상 HTTP 요청 처리 로직(`httpApi.ts`)을 Node의 raw request/response와 분리된 순수 함수로 만들어, 나중에 `nodeAdapter.ts`(로컬) 대신 Apps Script `doPost` 어댑터로 감싸는 것만으로 재사용 가능하도록 미리 격리해 둔다 — 실제 포팅 시 재사용 비율은 구현해봐야 확정되지만, 최소한 API 형태·인증 모델·GameSession 쪽 인터페이스는 이번에 검증한 것을 그대로 물려받는다. (3) Google Workspace 계정이 없는 교실에서도 로컬 전용 폴백 경로로 남을 수 있다. **구현 완료 (Milestone 4 2단계)**: `src/server/{tokenStore,sessionRegistry,httpApi,nodeAdapter,viteApiPlugin}.ts` 신규, `src/multiplayer/GameSession.ts`에 `advanceUntilInputRequired(force=false)` 메서드만 추가(기존 메서드 무변경), `vite.config.ts`에 `apiPlugin()` 등록. 확정된 대로 `httpApi.ts`는 Node raw request/response 타입을 전혀 참조하지 않는 순수 함수 `handleApiRequest(ApiRequest) => Promise<ApiResponse>`로 구현했고, Node 배관은 `nodeAdapter.ts` 한 파일에만 몰았다. `join` 시 토큰 발급(loose join, 무효화 없음) + 매 제출에 `Authorization: Bearer <token>` 요구 + 토큰이 바인딩된 참가자의 companyId/storeId/householdId와 요청 본문의 id가 일치해야 통과(불일치 403, 토큰 없음/미인식 401)를 그대로 구현했다. 검증: `tests/server/httpApi.test.ts`(서버 없이 `handleApiRequest` 직접 호출, 13개 — 세션 생성/404/slots/join·loose join/401/403/400/`since` 폴링/담합 방지 회귀/자동 드레인), `tests/server/integration.test.ts`(`http.createServer(nodeAdapter(...)).listen(0)` + Node 전역 `fetch`로 실제 TCP, 2개 — studentCount=2 세션에서 두 가상 학생이 join→스푸핑 제출 거부→제출→폴링→양쪽 제출 후 phase 전환→store/household 턴까지 진행해 라운드 1 정산 및 라운드 2 진입까지 확인). 전체 테스트 280개(기존 265 + 신규 15) 통과, `npm run typecheck`(양쪽 tsconfig)·`npm run lint -- --max-warnings=0`·`npm run build` 모두 클린 확인(빌드 산출물 65 모듈로 기존과 동일 — 서버 코드가 클라이언트 번들에 섞이지 않음). `tsconfig.ui.json` 그래프가 `vite.config.ts → viteApiPlugin.ts → nodeAdapter.ts → httpApi.ts → tokenStore.ts/sessionRegistry.ts`까지 transitively 전부 포함하는데도(TS는 "include"와 무관하게 import 그래프 전체를 타입체크) 두 그래프(Node 전용/DOM 포함) 모두에서 충돌 없이 통과함을 실제로 확인했다. `npx vite`를 직접 띄워 `curl`로 `/api/sessions`(201)·`/api/sessions/:id/slots`(200)·존재하지 않는 세션(404)·`/`(정적 페이지 200)를 호출해 Vite 플러그인 마운트가 실제 dev 서버에서도 동작함을 수동 확인했다. 상세는 docs/TODO.md Milestone 4 2단계, docs/MULTIPLAYER_DESIGN.md "구현 상태 (Milestone 4 2단계)" 참고. | 확정 (사용자 선택: B) |

## D-016 근거: 초기 기술 스택 선택 이유

- **TypeScript**: 경제 엔진은 다수의 수치·상태(자산, 재고, 가격 등)를 다루므로 타입 안정성이
  중요하다. 향후 UI(웹)와 Google Apps Script(V8 런타임, JS 계열) 양쪽에 재사용 가능한 로직을
  작성하기 좋다.
- **Vitest**: Vite 생태계 기반의 빠른 테스트 러너로 TypeScript/ESM을 별도 설정 없이 지원한다.
  Jest 대비 설정이 가볍고, 이후 프런트엔드를 Vite 기반으로 선택할 경우 도구 체인이 통일된다.
  다른 선택지(Jest)도 가능하나 현재 단계에서는 설정 비용이 더 낮은 Vitest를 채택한다.
- **tsx**: 빌드 없이 TypeScript 스크립트(`scripts/simulate-*.ts`)를 바로 실행하기 위해 사용한다.
  Headless Economy Simulator(Milestone 1)를 `npm run simulate`로 즉시 실행하는 데 적합하다.
- **UI 프레임워크 미확정**: 제품 스펙 12절에 따라 프런트엔드 기술은 이후 확정 가능하므로, 이번
  단계에서는 `src/ui`를 빈 책임 영역으로만 정의하고 경제 엔진이 특정 UI 프레임워크에 의존하지
  않도록 한다.

## D-020 근거: React + Vite 선택 이유 (architect 분석, 사용자 승인)

- D-016 시점에 이미 Vitest(Vite 계열)를 채택하며 "이후 프런트엔드를 Vite 기반으로 선택할 경우
  도구 체인이 통일된다"고 명시했다 — React+Vite는 그 의도를 실현한다.
- 정적 파일로 빌드되어 별도 서버 없이 배포 가능하다. [PRODUCT_SPEC.md](PRODUCT_SPEC.md)/
  [GOOGLE_SHEETS_ARCHITECTURE.md](GOOGLE_SHEETS_ARCHITECTURE.md)의 "교사별 무료 배포" 장기
  목표와 맞는다.
- phase 기반 폼, 실시간 제출 현황 같은 상태 복잡도에는 컴포넌트 모델이 실질적으로 유리하다.
- 대안 검토: **SvelteKit**(생태계/AI 보조 개발 자료가 더 작고, 정적 호스팅을 강제하려면
  `adapter-static` 추가 설정 필요 — 이 프로젝트는 정적 호스팅이 기본값이어야 함), **Next.js**
  (서버 런타임 전제가 "서버비 없는 배포" 목표와 충돌, 이번 프로젝트에 불필요).
- UI 상태관리: Redux/Zustand 등을 추가하지 않는다. `src/multiplayer/GameSession`(경제 엔진
  계층)이 유일한 진실 공급원이고, React는 `useSyncExternalStore`로 구독만 한다 — "엔진은
  UI를 몰라야 한다"는 원칙을 그대로 유지하기 위함.

## D-019 상세: 순이익 마이너스 / 거래량 감소 관찰 (조정 여부 미결정)

**문제 상황**: `npm run simulate:class`, `npm run validate:economy` 결과, 학생 1/5/10/20명
전 시나리오·여러 시드에서 기업/가게 평균 누적손익이 마이너스(대략 -200~-400)이고, 라운드가
지날수록 도매·소매 거래량이 꾸준히 줄어든다 (5명 기준 1라운드 78.5유닛 → 7라운드 35유닛).

**현재 결과**: 7라운드 안에 기업의 약 30~40%, 가게의 약 30% 내외가 현금 0 상태(사실상 파산)에
도달한다. 데이터 무결성 위반(음수 현금/재고, 자기 거래, 재현성 실패)은 0건.

**예상 원인**:
1. v1 규칙 기반 정책(`src/npc/decisions.ts`)이 매 라운드 가용 현금만 보고 생산량을 정하며,
   **이미 안 팔린 재고가 쌓여 있어도 생산을 줄이지 않는다** — 재고 회전율을 고려하지 않음.
2. 고정비(인건비+임대료)가 매 라운드 반복 부과되는데, 초기 자본(500)·가계 예산(라운드당 100)
   대비 도매→소매 마크업 체인(생산단가 → ×1.1~1.6 도매마진 → ×1.15~1.8 소매마진)이 최종
   소비자가를 밀어올려 가계 구매력이 상대적으로 부족해 보인다.
3. 유통비(도매/소매 단위당 차감)가 이미 얇은 마진을 추가로 깎는다.

**가능한 해결책**:
- A. 초기 자본/가계 예산 상향 — 장점: 파산 완화, 더 오래 관측 가능. 단점: 근본 원인(무재고
  감안 없는 생산 정책) 해결은 아니며 다른 수치 왜곡 가능.
- B. 고정비 하향 조정 — 장점: 생존율 개선. 단점: "고정비 부담"이라는 교육 의도가 약해질 수 있음.
- C. NPC/봇 생산 정책에 재고 인지 로직 추가(재고가 많으면 생산량 축소) — 장점: 더 현실적인
  행동, 근본 원인 해결. 단점: 정책 로직이 복잡해지고 첫 구현 범위를 넘어섬.
- D. 지금 상태를 "초기 자본 압박"으로 두고 다음 플레이테스트까지 보류 — 장점: 사용자가 실제
  교실 반응을 보고 판단할 수 있음. 단점: 파산율이 너무 높으면 게임 진행 자체가 재미없어질 위험.

**시도한 조치와 결과**: 사용자 선택에 따라 해결책 C(재고 인지 생산/매입 — "적정 재고까지만
채운다" order-up-to 정책)를 `src/npc/decisions.ts`에 구현했다 (`decideCompanyProduction`,
`decideStorePurchases`). 그러나 재시뮬레이션 결과 평균 순이익·파산율·거래량 감소 추세가
거의 그대로였다 — **재고 무시 생산은 주된 원인이 아니었다.**

재확인 결과, 실제로는 **고정비 대비 초기 자본 규모**가 더 근본적인 원인으로 보인다: 중심상권
기준 기업 고정비(인건비 40 + 임대료 50×1.6=80)는 라운드당 120인데 초기 자본은 500 —
매출이 전혀 없어도 약 4.2라운드 만에 고정비만으로 자본이 소진된다 (7라운드 게임 기준 절반을
넘는 기간). 가게도 비슷한 규모(라운드당 126)다. 이 경우 재고 정책과 무관하게 수익을 내기
전에 자본이 먼저 바닥나는 구조적 문제가 된다.

**결정 및 최종 조치**: 사용자와 상의해 자본과 고정비를 함께 조정했다 —
`initialCashCompany`/`initialCashStore` 500→800, `baseLaborCostCompany` 40→30,
`baseRentCompany` 50→40, `baseLaborCostStore` 30→25, `baseRentStore` 60→45 (중심상권 기준
라운드당 고정비 120→94, 자본 대비 순수 고정비 소진 한계가 4.2라운드→8.5라운드로 늘어나
7라운드 게임을 넘어선다).

재시뮬레이션 결과: 생존율이 크게 개선됐다 (예: 20명 학급 기업 생존 12/20→19/20, 가게
13/20→19/20, 5명 학급은 3/5→5/5). 다만 평균 누적손익은 여전히 마이너스(-300~-500 수준)로
남아 있다 — 이는 자본이 바닥나기 전에 게임이 끝난다는 뜻이지, 참여자들이 평균적으로 수익을
내고 있다는 뜻은 아니다. 데이터 무결성 위반은 여전히 0건, 재현성 유지.

**남은 판단 (미결정)**: 평균 손익이 계속 마이너스인 것을 추가로 조정할지, 아니면 (a) 이것이
"여러 전략 중 일부는 원래 불리할 수 있다"는 정상적인 전략적 다양성의 결과로 보고 그대로 둘지,
(b) Milestone 2의 실제 플레이테스트로 넘겨 그때 조정할지는 아직 사용자와 정하지 않았다. 이
문서에는 상태만 기록하고, 추가 수치 변경은 사용자 확인 후 진행한다.

## D-023 상세: studentCount=1일 때 카테고리당 NPC 1개 → 복점/독점 (economy-reviewer 발견)

**문제 상황**: `NPC_TARGETS.minCompanies`/`minStores`는 4인데 `PRODUCT_CATEGORIES`도 4개다.
`planNpcBackfill`(`src/npc/backfill.ts`)은 `studentCount=1`일 때 기준 NPC 수를
`max(0, 4-1)=3`개 만들고, 커버리지 보장으로 비어있는 카테고리에 1개를 더 채워 총 4개가
되는데, 카테고리도 4개이므로 결과적으로 **카테고리당 NPC가 정확히 1개씩** 배치된다.

**현재 결과**: Milestone 2는 항상 `studentCount=1`로만 세션을 만든다(D-021). 즉 사람이 고른
업종에는 "사람 기업 vs NPC 기업 1개"(복점), 나머지 업종에는 NPC 기업 1개만 있는 독점 시장이
된다. `validate:economy`에서도 `studentCount=1`이 다른 학급 규모보다 시장점유율 최대치가
높게 나온다(0.27~0.43 vs `studentCount=20`의 0.14~0.17) — 이는 헤드리스 시뮬레이터 단계에서는
"여러 시나리오 중 하나"라 두드러지지 않았지만, Milestone 2가 이 값만 계속 쓰면서 상시 조건이
됐다.

**예상 원인**: `NPC_TARGETS`가 애초에 5/10/20명 등 다인원 헤드리스 시뮬레이션을 염두에 두고
정해진 값이라, `studentCount=1`(Milestone 2의 유일한 실제 사용 조건)에서 카테고리당 경쟁자
수가 지나치게 적어지는 경우를 별도로 검토하지 않았다.

**가능한 해결책**:
- A. 학급 규모가 작을 때 카테고리당 NPC 최소치를 올린다(예: 카테고리당 2~3개) — 장점: 더
  그럴듯한 소규모 시장. 단점: 새 튜닝 필요, NPC 수 증가로 UI에 표시할 매물이 늘어남.
  (재고 인지 정책과 별개로 밸런스 넘버를 또 바꾸는 것이므로 D-019처럼 재검증 필요.)
- B. 지금 상태를 "소규모 학급은 원래 시장이 얇다"는 현실적 특성으로 받아들이고 그대로 둔다 —
  장점: 추가 작업 없음. 단점: Milestone 2가 유일하게 쓰는 조건이 항상 이런 상태라는 점은
  "믿을 만한 학급 시장"이라는 의도와는 다소 거리가 있음.
- C. NPC 수를 카테고리 수에 비례하도록 재설계(예: 카테고리당 최소 2개 = 총 8개) — 장점:
  구조적으로 재발 방지. 단점: 5/10/20명 시나리오에도 영향을 주므로 D-019 손익 추세 재검증 필요.

**결정 및 조치**: 사용자가 C를 선택했다. `NPC_TARGETS.minCompanies`/`minStores`(전체 최소치)를
`minCompaniesPerCategory`/`minStoresPerCategory = 2`(카테고리별 최소치)로 재설계했다
(`src/economy/config.ts`, `src/npc/backfill.ts`). `fillCategoryCoverage`(전체 개수를 채운 뒤
빈 카테고리만 보정)를 `fillCategoryMinimums`(카테고리마다 직접 부족분만큼 채움)로 교체 —
"카테고리 수와 우연히 같은 전체 최소치" 문제 자체가 사라진다.

**재검증 결과** (`npm run simulate:class`, `npm run validate:economy`, 학생 1/5/10/20명 ×
시드 3개):
- `studentCount=1` 최대 소매점유율 0.58~0.79 → **0.27~0.35**로 크게 개선.
- `studentCount=1` 최대 도매점유율 0.58~0.79 → 0.34~0.52로 개선 (다만 카테고리당 2개면
  구조적으로 "복점"이라 한쪽이 50%에 가까운 점유율을 갖는 것 자체는 정상 — 3개 이상으로
  올리면 더 낮아지지만 이번엔 2로 결정).
- `studentCount=5`도 이전엔 라운드로빈으로 우연히 커버리지가 채워져 NPC가 0명이었는데,
  카테고리별 최소치 도입으로 NPC 3개가 추가되어(총 5→8개) 같은 개선이 적용됨.
- `studentCount=10/20`은 변화 없음 (원래도 라운드로빈만으로 카테고리당 2개 이상 충족).
- 데이터 무결성 위반 0건, 재현성 유지, 브라우저에서 실제 플레이로 카테고리당 매물 2개
  (또는 라운드 초반이라 아직 재고를 못 채운 NPC가 있어 1개)로 보이는 것을 확인.

**부작용 발견 및 후속 수정**: 판매자가 늘었는데 소비자 수(`minConsumers`/`consumersPerStudent`,
학생 수 기준)는 그대로라, 같은 수요를 더 많은 판매자가 나눠 갖게 되어 평균 손익이 오히려 더
마이너스가 됐다(`studentCount=5` 기업 평균 손익 -351→-598, 가게 평균 손익 -192→-488).
사용자가 지적: "모든 참여자가 기업·가게·가계 역할을 함께 수행하므로(D-001), 가게가 늘면
가계(소비자)도 함께 늘어야 한다." 이 원칙을 NPC 보충에도 적용해 소비자 목표치의 기준을
**학생 수**에서 **실제 가게 수(학생+NPC 합계)**로 바꿨다(`consumersPerStudent` →
`consumersPerStore`, `src/npc/backfill.ts`). 가게 수가 그대로인 경우(`studentCount=10/20`)
소비자 수가 줄어들지 않도록 배율을 예전과 동일한 실효 배율(2.5)로 맞췄다.

**최종 재검증 결과**: `studentCount=10/20`은 손익·생존율이 이번 전체 수정 이전과 완전히
동일함(회귀 없음). `studentCount=1`은 기업/가게 평균 손익이 원래 baseline보다도 개선됨
(기업 -518→-233, 가게 -300→-218, 생존율 8/8). `studentCount=5`도 원래 baseline에 근접
(기업 -351→-499, 가게 -192→-228, 생존율 8/8). 최대 시장점유율은 더 낮아짐(`studentCount=1`
도매 0.20~0.26, 소매 0.19~0.24). 데이터 무결성 위반 0건, 재현성 유지, 브라우저 실제
플레이로 카테고리당 매물 2개·소매 거래량 증가(93개, 이전 대비 약 2배) 확인. 79개 테스트
전부 통과.

## D-024 상세: 가계 "필수 소비"(식품·의류) 가중치 산정 근거

**만족도 페널티 값(food=0.20, apparel=0.10) 근거**: 헤드리스 시뮬레이션(`npm run
validate:economy`) 기준 v1 baseline의 가계 `finalSatisfaction` 정상상태는 대략 0.48~0.54
구간에서 안정된다(가중평균 `satisfactionScore = satisfactionScore*0.7 + roundSatisfaction*0.3`
이 매 라운드 적용되므로 급격히 변하지 않는다). 최악의 경우(식품·의류를 여러 라운드 연속으로
모두 놓치는 경우) 두 페널티(0.20+0.10=0.30)가 매 라운드 `roundSatisfaction`에서 계속
차감되면, 스무딩 공식을 통해 정상상태가 대략 0.18~0.24 구간까지 낮아진다 — 즉 "필수 소비를
계속 놓치면 눈에 띄게 나빠지지만 0으로 완전히 무너지지는 않는다"는 정성적 목표를 만족한다.
하나만 놓쳤을 때(식품만 0.20, 또는 의류만 0.10)는 정상상태가 그 사이(대략 0.30~0.42 구간)에
위치해 "식품을 놓치는 쪽이 의류를 놓치는 쪽보다 뚜렷이 나쁘다"는 요구사항(2:1 가중치)이
결과에도 구분되어 드러난다.

**NPC 가산점 값(food=0.15, apparel=0.075) 근거**: `scoreListingForBuyer`의 점수 구성은
`qualityWeight*quality - (1-qualityWeight)*normalizedPrice + tieBreak`이며, quality/
normalizedPrice 항은 대략 0~1.5 스케일에서 움직이고 tieBreak는 ±0.01의 미세한 동점 방지용
잡음이다. 가산점 0.15(식품)는 이 스케일의 약 10~25%에 해당해 "품질·가격 차이가 크지 않을 때는
식품을 우선 고르지만, 가격이 극단적으로 나쁘면 여전히 다른 카테고리를 고를 수 있다"는 균형을
의도했다(단위 테스트 `tests/npc/decisions.test.ts`의 "does not let the priority bonus override
an extreme price disadvantage" 케이스로 확인). 의류 0.075는 정확히 절반으로 맞춰 만족도
페널티와 동일한 2:1 비율을 유지한다. 두 체계(만족도 페널티 vs NPC 가산점)는 스케일이 근본적으로
달라(0~1 확률 vs 상대 점수) 같은 상수를 공유하지 않고 독립적으로 관리한다.

**decideStorePurchases(기업→가게 도매 매입) 무영향 보장**: `scoreListingForBuyer`에
`priorityBonus` 매개변수를 6번째 선택 인자(기본값 0)로 추가했고, `decideStorePurchases`의 호출부는
수정하지 않았다(인자 5개 그대로) — 기본값 0이 자동 적용되므로 가게의 매입 알고리즘은 이 변경
이전과 완전히 동일하게 동작한다. `tests/npc/decisions.test.ts`의 기존 `decideStorePurchases`
테스트가 수정 없이 그대로 통과하는 것으로 회귀 없음을 재확인했다.

## 변경 이력

| 날짜 | 내용 | 비고 |
|------|------|------|
| 2026-08-26 | 프로젝트 초기 구조, 문서, subagent, 테스트 기반 구축 (Milestone 0). D-001~D-017 확정. | 최초 작성 |
| 2026-08-26 | 프로젝트 폴더를 `경제 게임 프로젝트`(한글/공백)에서 `economy-project`(ASCII)로 이전. 내용물은 동일, git 이력 없음(커밋 전이었음). | 사용자 요청 |
| 2026-08-26 | Milestone 1(Headless Economy Simulator) 구현: 실제 생산/도매/소매/비용/NPC 로직 (`src/economy`, `src/npc`, `src/engine/simulateGame.ts`). D-018 확정, D-019 관찰 사항 기록. | Milestone 1 |
| 2026-08-26 | D-019 대응: 재고 인지 생산/매입 정책 추가(효과 미미) → 초기자본/고정비 재조정(효과 큼, 생존율 대폭 개선). 평균 손익은 여전히 마이너스, 추가 조정 여부 미결정. | 사용자와 함께 진단 |
| 2026-08-26 | Milestone 2 착수: architect가 UI 프레임워크/엔진 입력 경로 계획 수립. D-020(React+Vite) 확정, D-021(1인 플레이 우선 범위) 확정. | Milestone 2 계획 |
| 2026-08-26 | Milestone 2 핵심 플레이 루프 구현·검증 완료: `RoundEngine.stepPhase()`, `humanDecisions.ts`, `GameSession`, React UI(창업 준비~라운드 결과), `LocalStorageAdapter`(미연결). D-022(소매가격 설계 공백) 확정. 브라우저에서 실제 2라운드 수동 플레이로 확인, 헤드리스 시뮬레이터 회귀 없음(diff 확인), `npm run build` 정적 번들 생성 확인. | Milestone 2 구현 |
| 2026-08-26 | code-reviewer가 critical 버그 발견 후 수정: `GameSession.advancePhase()`의 재진입 방지 로직이 `notify()` 이후(trailing `.finally()`)에 플래그를 지워, `notify()`가 동기적으로 유발하는 "다음 phase로" 재호출을 "아직 안 끝난 이전 요청"으로 오인해 삼켰다 — 실제로 브라우저에서 사람이 턴을 제출한 뒤 자동 진행이 첫 조용한 phase에서 멈추는 것으로 재현됨. `notify()` 호출 "전"에 플래그를 지우도록 수정, 회귀 테스트 추가(`tests/multiplayer/gameSession.test.ts`), 브라우저에서 2라운드 재검증. economy-reviewer는 자기거래 금지·가격 자유 모두 문제없음, D-023(NPC 밸런스 신호) 발견. | code-reviewer + economy-reviewer 검토 |
| 2026-08-26 | D-023 해결(사용자가 해결책 C 선택): NPC 보충을 전체 최소치에서 카테고리별 최소치(`minCompaniesPerCategory`/`minStoresPerCategory=2`)로 재설계. 학생 1/5/10/20명 전부 재검증(시장점유율 개선 확인, 데이터 무결성/재현성 유지), 브라우저 재플레이 확인. 부작용(평균 손익 추가 악화) 발견. | D-023 구현 |
| 2026-08-26 | D-023 후속: 사용자 지적("가게가 늘면 가계도 늘어야, D-001") 반영해 NPC 소비자 목표치를 학생 수 기준(`consumersPerStudent`)에서 가게 수 기준(`consumersPerStore=2.5`)으로 변경. 재검증 결과 `studentCount=10/20`은 완전히 동일(회귀 없음), `studentCount=1/5`는 원래 baseline보다도 개선(생존율 8/8, 손익 개선, 시장점유율 추가 개선). 79개 테스트 통과, 브라우저 재확인. | D-023 후속 수정 |
| 2026-08-26 | Milestone 2 남은 항목 중 `LocalStorageAdapter` 연결 완료: `GameSession.enableAutoSave()`가 phase 확정마다 자동 저장, 앱 시작 시 `ResumePromptScreen`이 이어하기/새로 시작하기를 묻는다. `resumeFromState()`/`loadSaved()`/`clearSaved()` 추가, 손상된 저장값·완료된 게임 저장값은 무시. 브라우저 새로고침 → 정확히 같은 지점(현금/매물까지)에서 재개되는 것을 실제로 확인. 6개 테스트 추가(85개 전체 통과), 헤드리스 시뮬레이터 회귀 없음. | LocalStorageAdapter 연결 |
| 2026-08-27 | Milestone 2 남은 항목 중 교사 화면(읽기 전용 전체 시장 현황) 구현: architect 분석 결과 라운드 수(D-013)/RNG 시드 설정 화면은 가치가 낮아 이번 범위에서 제외하고, 대신 언제든 열어볼 수 있는 오버레이(`TeacherOverviewScreen`)로 기업/가게 전체 순위(학생+NPC, 누적손익 내림차순)와 라운드별 시장 지표 추이를 노출하기로 결정. 새 최상위 화면을 추가하지 않고 `GameScreen`에 토글로 배선했으며, 기존 턴 입력 폼이 지역 state를 갖고 있어 언마운트되면 입력이 사라지는 문제를 피하기 위해 조건부 언마운트 대신 `display:none`으로만 숨기는 방식을 택함. 엔진/경제 로직(`src/engine`, `src/economy`, `src/npc`, `GameSession`, `domain.ts`)은 전혀 수정하지 않은 순수 읽기 전용 기능이라 시뮬레이션 회귀 확인은 불필요, `teacherOverview.ts` 순수 함수에 단위 테스트 5개 추가(90개 전체 통과). code-reviewer 검토에서 읽기 전용 원칙 위반·언마운트 버그·타입 안전성 문제 없음 확인. 브라우저에서 실제로 턴 입력값(생산량 55) 유지한 채 토글 여닫기, 라운드 1 정산 전 "데이터 없음" 안내, 정산 후 순위/지표 정상 반영을 확인. | 교사 화면 구현 |
| 2026-08-27 | Milestone 2 "컴포넌트 단위 자동 테스트" 항목 검토: architect가 전체 RTL/jsdom 컴포넌트 스위트 도입 여부를 분석한 결과, 실제로 발생했던 유일한 회귀 버그(`GameSession` 재진입 방지)는 이미 세션 레벨 Node 테스트로 더 저렴하게 커버되어 있고 턴 화면의 로컬 계산 버그는 서버 측 `humanDecisions.ts`의 이중 검증 덕에 데이터 무결성이 아니라 UX 수준 피해에 그쳐, 새 의존성 3개(`@testing-library/react`, `jsdom` 등) + 두 tsconfig 재배선 비용 대비 방어할 리스크가 작다고 판단해 전체 도입은 보류를 권고. 사용자가 "저비용 대안"(순수 함수 추출 + 기존 Node 테스트) 선택. `CompanyTurnScreen`/`StoreTurnScreen`/`HouseholdTurnScreen`의 파생 계산(예산 초과 여부, 최대 구매 가능 수량, 매입/구매 총액, 구매 수량 합계)을 `src/ui/turnCalculations.ts`(React 비의존 순수 함수)로 추출, 화면들은 계산 호출로만 치환(렌더링/지역 state/JSX 불변). `tests/ui/turnCalculations.test.ts`에 경계 케이스 포함 26개 단위 테스트 추가, 새 의존성/설정 변경 없음(116개 전체 통과). 브라우저에서 세 턴 화면 모두 예산/수량 초과 시 경고·버튼 비활성화가 정확히 동작하고 정상 범위에서는 라운드 정산까지 문제없이 진행되는 것을 실제로 확인(콘솔 에러 없음). 재검토 시점은 Milestone 4 진입 또는 컴포넌트 규모가 크게 늘어날 때로 TODO.md에 기록. | 컴포넌트 테스트 검토 |
| 2026-08-27 | Milestone 2 마지막 남은 항목(code-reviewer 지적 medium) 처리: `resolveStorePurchases`/`resolveHouseholdPurchases`(`src/economy/humanDecisions.ts`)가 자기거래 금지(D-005/D-006)를 "호출자가 미리 필터링했다"는 문서상 전제에만 의존하던 것을, `companies`/`stores` 소유자 맵을 새로 받아 함수 경계에서 직접 재검증하도록 하드닝. 매물의 판매자가 맵에 없거나(`seller === undefined`) 구매자와 같은 `ownerId`면 해당 요청 라인을 조용히 건너뜀. 규칙 자체는 바꾸지 않고 강제 위치만 이동하는 defense-in-depth이며, 유일한 실제 호출부(`simulateGame.ts`)는 이미 필터링된 맵을 넘기므로 정상 경로에는 영향 없음(economy-reviewer가 `market.ts`의 사전 필터와 동일한 데이터 소스를 재사용함을 확인해 회귀 불가능함을 검증). `tests/economy/humanDecisions.test.ts`에 자기거래 시도·미확인 판매자 케이스 4개 추가(총 120개 통과), `npm run simulate:class`/`validate:economy` 수치 동일 확인. code-reviewer는 시그니처 일관성·`continue` 부작용 없음·strict 타입 안전성·봇 경로 무영향·테스트가 우연히 통과하는 게 아님을 확인, 사소한 개선 여지(4곳에 중복된 소유권 판정 조건을 `isSameOwner` 같은 공유 predicate로 뽑을 수 있음, blocking 아님)만 남김. 이로써 Milestone 2 "남은 항목"이 모두 소진됨 — 4~7라운드 커리큘럼 차별화는 애초에 Milestone 2 범위가 아니었음을 확인해 Milestone 6로 이동. | self-trade 하드닝, Milestone 2 마감 |
| 2026-08-27 | Milestone 3 착수, 1단계(기업 턴 규칙 기반 전략 비서) 구현: architect 분석 결과 ADVISOR_RULES.md가 요구하는 지표 중 상당수(판매율/재고율/이익률/유통비/공급처 의존도/가계 소비 비율/필수 소비)가 엔진에 계측되지 않고 있음을 확인, 세 턴을 한 번에 만들지 않고 기업 턴부터 단계적으로 진행하기로 결정(가게 턴은 "공급처 의존도" 신규 개념 설계 필요, 가계 턴은 "필수 소비" 분류가 콘텐츠/밸런스 판단이라 임의로 정의하지 않음). `RoundMetrics`에 생산량/판매량/매입/매출 계측 필드 7개를 순수 추가(경제 공식 불변), `src/ui/turnCalculations.ts`의 비용 계산 함수를 `src/economy/costs.ts`로 이동(advisor가 UI 레이어를 참조하지 않도록), `src/economy/marketStats.ts`(시장 평균가/품질, 경쟁자 수) 신규, `src/advisor/{types,rules,companyAdvisor}.ts` 신규(순수 함수, rng 미사용, 임계값은 `rules.ts`에 분리). tester가 학생 1/5/10/20명×7라운드 전체 시뮬레이션으로 크래시·NaN·undefined 노출 없음 확인, 계측 정확성은 이월 재고가 있는 2라운드 시나리오를 손계산으로 검증(생산량≠판매량이 정확히 구분됨). code-reviewer는 레이어 분리·타입 안전성·re-export 회귀 없음 확인(경미한 개선 제안만: 라벨 중복, non-null assertion 패턴, blocking 아님). economy-reviewer가 임계값 스케일 적정성·정답 미지시/미확정예측 원칙 준수·업종전환 조언의 D-011 공식 일치·타이밍 고지("지난 라운드 마감 시세" 명시) 확인, 실제 버그 2건 발견: (1) 이월 재고로 판매량이 생산량을 초과하는 정상 상황(턴의 13~24%)에서 "-4.5개 미판매" 같은 산술 모순 문구, (2) 수량 소수 미반올림 — 둘 다 텍스트 생성 버그로 분류해 승인 없이 수정, 재검증 완료(164개 테스트 통과). **밸런스 관찰(사용자 확인 완료)**: `highCompetitorCount=3`이 절대 인원수 기반이라 학생 1명 세션(D-021, 현재 유일한 플레이 조건)에서는 "경쟁 인지"/"업종 전환 검토" 조언 축이 사실상 발동하지 않음(NPC_TARGETS.minCompaniesPerCategory=2, D-023 구조상 학급 규모의 계단함수가 됨) — 사용자가 "지금 상태 유지"를 선택, Milestone 4 다인원 확장 시 재검토하기로 TODO.md에 기록. UI 연결은 다음 단계로 미룸. | Milestone 3 1단계(기업 턴 비서) |
| 2026-08-27 | Milestone 3 2단계(가게 턴 규칙 기반 전략 비서) 구현: `src/advisor/storeAdvisor.ts` 신규, 1단계와 동일 구조. `RoundMetrics`에 `storeSupplierCount`/`storeTopSupplierSpendShare` 계측 필드 2개 순수 추가, `src/economy/marketStats.ts`에 `computeStoreCompetitorCount` 추가 및 `computeCategoryAverages` 타입 일반화(도매/소매 공용), `src/advisor/shared.ts` 신규(1단계 code-reviewer가 지적한 라벨 중복 해결). architect가 기존 문서-코드 불일치를 발견: `docs/DECISIONS.md`는 "가게 상권 적합성이 소매 매력도에 반영된다"고 적었지만 실제로 `scoreListingForBuyer`는 `DISTRICTS[...].storeSuitability`를 전혀 참조하지 않음(상권은 임대료에만 영향) — storeAdvisor는 이를 인과적 조언으로 쓰지 않고 임대료 배율 사실 정보로만 노출하기로 결정(수요 공식 자체를 고치는 건 별도 승인 필요 사안, 이번 범위 밖). "마진"은 `StoreState`에 새 원가 필드 없이 직전 라운드 매입 총액/수량 근사치로 계산. tester가 손계산으로 공급처 의존도 계측 정확성 검증, 학생 1/5/10/20명×7라운드 전체 시뮬레이션에서 크래시 없음과 "다양화 검토" 옵션이 독점 상황에선 절대 안 뜨는 안전장치를 확인. code-reviewer·economy-reviewer 모두 버그 없음 확인(1단계에서 발견됐던 산술모순·소수미반올림 버그 재발 없음). **밸런스 관찰 2건(사용자 확인, 둘 다 "지금 상태 유지" 선택)**: (1) `highStoreCompetitorCount=3`도 기업 턴과 동일한 학급 규모 계단함수 재현. (2) `highSupplierConcentrationRatio=0.8` 기반 "공급처 편중" 경고가 예상과 반대로 학생 소유 가게 기준 58~86%라는 높은 빈도로 발동 — `src/npc/decisions.ts`의 그리디 단일 매물 우선 구매 알고리즘 때문(NPC 구매 알고리즘 자체를 바꾸는 건 시장 역학 전반에 영향을 주는 별도 작업으로 분리). 210개 테스트 통과, `simulate:class`/`validate:economy` 수치 완전 동일 확인(D-019에도 영향 없음). UI 연결과 가계 턴 비서(3단계)는 다음으로 미룸. | Milestone 3 2단계(가게 턴 비서) |
| 2026-08-28 | Milestone 3 3단계(가계 턴 규칙 기반 전략 비서) 구현, D-024 확정(사용자가 이미 수치까지 승인): 가계 "필수 소비"를 식품·의류 둘 다로 정하고 2:1 가중치(만족도 페널티 food=0.20/apparel=0.10, NPC 우선순위 가산점 food=0.15/apparel=0.075)로 차등을 표현했다. `src/economy/config.ts`에 상수 4종 추가, `src/npc/decisions.ts`의 `scoreListingForBuyer`를 export하고 6번째 선택 인자 `priorityBonus`(기본값 0) 추가(`decideStorePurchases` 호출부는 무수정 — 인자 5개 그대로라 회귀 없음), `decideHouseholdPurchases`에서만 가산점 적용. `RoundMetrics`에 `householdSpend`/`householdUnitsBought`/`householdCategoryCount`/`householdTopCategorySpendShare`/`householdEssentialCategoriesMissed` 5개 필드 순수 추가, `src/engine/simulateGame.ts`의 가계 소비 처리 로직을 확장해 카테고리별 지출·필수 소비 미충족(매물이 실제로 있었을 때만 판정, 재고 0 매물은 면제) 계측과 `roundSatisfaction` 페널티 반영을 구현. `src/advisor/householdAdvisor.ts` 신규(1~2단계와 동일 구조), "직전 라운드 가용예산"을 별도 저장하지 않고 `현재 현금 + 직전 라운드 지출`로 역산(household-turn phase의 "용돈 지급→지출" 순서 불변 조건에 의존). tester가 손계산 시나리오(식품만 놓침/식품·의류 둘 다 놓침/매물 자체가 없어 면제되는 케이스)로 계측 정확성을 검증했고, 학생 1/5/10/20명×7라운드 전체 시뮬레이션에서 크래시 없음을 확인. 신규 테스트 39개(`tests/npc/decisions.test.ts` 확장 4개, `tests/engine/simulateGameMetrics.test.ts` 확장 5개, `tests/advisor/householdAdvisor.test.ts` 26개, `tests/advisor/householdAdvisorSimulation.test.ts` 4개) 포함 총 249개 테스트 통과, `npm run lint`/`npm run build` 통과. **경제 수치 변화 확인**(의도된 변화, `npm run simulate:class`로 D-024 적용 전/후 비교): `finalSatisfaction`이 학생 1/5/10/20명 기준 0.54/0.51/0.51/0.48(적용 전, D-024 상세에 기록된 "정상상태 0.48~0.54"와 일치)에서 0.45/0.47/0.48/0.39(적용 후)로 낮아졌다 — 설계에서 예측한 최악의 경우(0.18~0.24, 매 라운드 두 필수 카테고리를 계속 다 놓쳤을 때)보다는 완만한 하락으로, 실제 플레이에서는 매 라운드 필수 소비를 항상 100% 놓치지는 않기 때문에 합리적인 범위다. `avgCompanyProfit`/`avgStoreProfit`/생존 기업·가게 수/`validate:economy`의 데이터 무결성은 D-024 적용 전후로 사실상 동일(가계 쪽 로직만 바꿨으므로 예상대로 무관함). 도매/소매 시장점유율에 ±0.01~0.03 수준의 미세 차이가 있는데, 이는 가계 구매 우선순위 변화가 가게 매출/현금 흐름을 바꾸고, 그 결과가 이후 라운드 기업/가게의 생산·매입 여력(따라서 다음 라운드 매물 수·rng 소비 횟수)에 연쇄적으로 영향을 주는 결정론적 파급효과다(같은 시드 재실행 시 항상 동일한 값이 재현되는 것은 확인함 — "무작위 노이즈"가 아니라 "입력이 바뀌면 이후 결과가 달라지는 정상 동작"). UI 연결은 다음으로 미룸. | Milestone 3 3단계(가계 턴 비서), D-024 확정 |
| 2026-08-28 | D-024 검토(tester+economy-reviewer)에서 발견된 사항 처리: (1) code-reviewer가 리뷰 과정에서 남은 임시 디버그 파일(`src/engine/_reviewTemp_simulateGame.ts`)을 지적해 삭제. (2) tester가 NPC 우선순위 가산점의 실효과를 실측한 결과, 헤드리스 시뮬레이터의 "학생 소유 자동진행 가계"와 진짜 NPC 가계가 `essentialNpcPriorityBonus`를 동일하게 받는데 `household-turn`이 `npc-consumer-behavior`보다 항상 먼저 실행되는 라운드 순서 때문에, 다인원(5/10/20명) 시나리오에서는 학생 자동진행이 희소한 식품을 먼저 선점해 **진짜 NPC의 식품 확보량이 오히려 줄어드는 역전**이 나타남을 발견(NPC 식품 지출비중 -0.77~-2.8%p). economy-reviewer가 독립 재현으로 동일 방향 확인, 다만 **현재 유일한 실제 플레이 조건(학생 1명, D-021)에서는 의도대로 +방향(+1.45~+2.5%p)으로 작동**함도 함께 확인. 사용자가 "지금은 그대로 병합, Milestone 4(다인원 확장) 진입 전 별도 수정"을 선택 — 해결책(헤드리스 시뮬레이터의 학생 자동진행 구매에는 가산점 미적용, NPC 알고리즘 호출 경로 구분 필요)은 TODO.md에 기록, NPC 알고리즘 변경이라 별도 승인 필요. (3) tester/economy-reviewer가 이번 변경과 무관한 기존 버그를 발견해 별도 기록: `BASE_STORE_PURCHASE_QUANTITY`(15)×가게 전략 배율(premium 0.7 등)이 정수가 아닌 매입 목표량(예: 10.5)을 만들어 재고/매물 수량에 소수가 전파됨(기업 쪽은 배율 조합이 우연히 항상 정수라 무영향). `validate:economy`는 정수 여부를 검사하지 않아 지금까지 미발견 상태였음. | D-024 리뷰 후속 조치 |
| 2026-08-28 | Milestone 3 마지막 항목(전략 비서 UI 연결) 완료: `src/ui/screens/AdvisorPanel.tsx`(신규, `{advice: TurnAdvice}`만 받는 순수 프레젠테이션 컴포넌트)를 세 턴 화면(`CompanyTurnScreen`/`StoreTurnScreen`/`HouseholdTurnScreen`)에 "비서 의견 보기" 토글 카드로 연결. 기존 결정 폼 JSX/로직은 무수정, 형제 카드로만 추가. 옵션 3개는 모두 동일 CSS 클래스로 렌더링해 "정답 지시 금지" 원칙을 시각적으로도 지킴. 순수 UI 배선이라 경제 로직 회귀 확인 불필요, 새 RTL/jsdom 테스트도 추가하지 않음(기존 결정과 일관). 브라우저에서 세 화면 모두 실제 확인: 토글 열고 닫아도 폼 입력값 유지, 1라운드/2라운드 각각 데이터 가용성 안내가 정확히 전환, 1단계에서 고쳤던 이월재고 문구가 2라운드에서도 산술 모순 없이 정상 표시, 콘솔 에러 없음. code-reviewer가 블로킹 이슈 없음 확인, `useMemo([state,...])`의 참조 동일성 문제(GameState가 절대 새 객체로 교체되지 않아 내용이 바뀌어도 재계산을 건너뛸 수 있음 — 기존 `StoreTurnScreen`/`HouseholdTurnScreen`의 `eligible` useMemo에도 있던 기존 패턴)를 Milestone 4(동시 턴 멀티플레이) 진입 전 재검토가 필요한 기술 부채로 지적, TODO.md에 기록. 이로써 **Milestone 3(규칙 기반 전략 비서)가 완전히 완료됨**(1단계 기업 턴, 2단계 가게 턴, 3단계 가계 턴+D-024, UI 연결). | Milestone 3 완료(UI 연결) |
| 2026-08-28 | Milestone 4 진입 전 처리 권고였던 `useMemo` 참조 동일성 버그 수정(architect 설계, 순수 UI 배선 변경, 경제 로직/렌더 결과/이벤트 핸들러 무변경): `useGameSession`(`src/ui/useGameSession.ts`)이 `useSyncExternalStore`의 반환값을 `version`(숫자)으로 그대로 노출하도록 변경, `App.tsx`가 `CompanyTurnScreen`/`StoreTurnScreen`/`HouseholdTurnScreen`에 `version` prop을 새로 전달. 세 화면에서 `state`(또는 `state.wholesaleListings`/`state.retailListings`)를 직접 의존성으로 쓰던 `useMemo`(비서 조언 계산, `StoreTurnScreen`/`HouseholdTurnScreen`의 `eligible` 매물 필터)를 모두 `[version, 참가자.id]`로 교체하고, 각 위치에 "state는 제자리에서 mutate되어 참조가 안 바뀌므로 version 카운터로 감지한다"는 `eslint-disable-next-line react-hooks/exhaustive-deps` 주석을 남겼다(여러 줄 `useMemo`는 의존성 배열이 있는 줄 바로 위에 주석을 둬야 규칙이 정확히 그 줄에 적용됨을 확인). `CompanyTurnScreen`의 `computeProductionCost` useMemo(로컬 프리미티브만 의존)는 원래 문제가 없어 그대로 둠. `typecheck`(양쪽 tsconfig)/`lint --max-warnings=0`/`test`(253개)/`build` 모두 통과, `npm run dev` 기동 시 컴파일 오류 없음 확인. 경제 로직 변경이 없어 `simulate:class`/`validate:economy` 재실행은 생략. 다만 이 작업 세션에는 브라우저 조작 도구가 없어, 지시받았던 수동 브라우저 시나리오(생산량 변경 시 비서 패널 갱신, 라운드 연속 진행 시 잔상 없음, 새로고침 후 이어하기)는 실제 클릭/입력으로 검증하지 못했다 — 브라우저 도구가 있는 세션에서 한 번 더 확인 필요. | useMemo 참조 동일성 버그 수정 |
| 2026-08-28 | Milestone 4 1단계(`GameSession` 다인원 코어 리팩터링, 네트워크 없음) 구현: architect 분석대로 갭이 `src/engine`/`src/economy`/`src/npc`/`src/advisor`가 아니라 `GameSession` 한 클래스에 집중돼 있음을 확인, 해당 파일들은 전혀 수정하지 않았다. `GameSession`이 단일 `humanPlayer` 대신 `humanPlayers: readonly PlayerState[]`(= `state.players`, NPC는 애초에 별도 레코드라 그대로 재사용 가능)를 갖도록 변경, `getPlayers()` 신규 추가, `getHumanPlayer()`는 `@deprecated`로 남기되 `humanPlayers.length !== 1`이면 명시적으로 에러를 던지도록(다인원에서 첫 번째 학생만 조용히 반환하는 오용을 막기 위해) 결정. 생성자에 `studentCount: number = 1`을 **마지막 인자**로 추가(중간에 끼워 넣으면 기존 `new GameSession(seed)`/`new GameSession(seed, choices)` 호출의 인자 의미가 바뀌므로), `studentCount > 1`이면 `BusinessSetupChoices`는 적용하지 않고 엔진 기본 배정을 그대로 쓰기로 함(여러 학생 각자의 창업 준비 UI는 다음 단계로 명시적으로 이월, 코드 주석에 근거 기록). `pendingCompanyInput`/`pendingStoreRequest`/`pendingHouseholdRequest`(단일 필드) → `Map<ParticipantId, ...>` 3개로 교체, `submitCompanyDecision`/`submitStoreDecision`/`submitHouseholdPurchases`가 참가자 id를 첫 인자로 받도록 시그니처 변경(breaking change, 의도됨) 후 그 id가 이 세션의 실제 학생 소유인지 검증(모르는 id·NPC id는 에러). `isWaitingForHumanInput()`을 "현재 phase에 필요한 제출 중 하나라도 비어 있으면 true"로 일반화하고 `getUnsubmittedParticipantIds()`를 신규 추가(향후 제출 현황 UI/타임아웃 로직용으로 미리 준비, 이번 단계 UI에서는 미사용). 세 턴 화면(`CompanyTurnScreen`/`StoreTurnScreen`/`HouseholdTurnScreen`)의 제출 호출에 `company.id`/`store.id`/`household.id`만 추가(렌더링/로컬 state/UX 무변경), `App.tsx`는 여전히 `studentCount` 인자 없이(=1) 세션을 만듦. 기존 24개 테스트는 호출부에 id 인자를 추가하는 순수 시그니처 정합만 하고 로직/기대값은 무변경, 신규 테스트 4개 추가(총 262개 통과): (1) `studentCount=3` 제출 추적, (2) 미제출 상태 `advancePhase()` 거부 + `force=true` 봇 폴백(고정비 차감으로 상태 변화 확인), (3) 존재하지 않는/NPC `companyId` 제출 거부, (4) **D-026 실측**(아래). `typecheck`(양쪽 tsconfig)·`lint --max-warnings=0`·`test`(262개)·`build` 모두 통과, `simulate:class`/`validate:economy`는 이번 변경이 `GameSession`에만 있어(헤드리스 시뮬레이터는 이 클래스를 쓰지 않음) 수치 완전 동일(코드 diff로 `src/engine`/`src/economy`/`src/npc`/`src/advisor` 무변경 확인). **D-026(후보) 실측 결과, 공식은 그대로 둠**: seed 1~40 스윕(가계 A=항상 희소 필수재 1개 구매, 가계 B=항상 그 카테고리 요청 안 함, 시장엔 그 카테고리 매물 정확히 1개)에서 B가 페널티를 받는지 여부가 처리 순서(엔진 내부 `shuffle`)에 따라 실제로 갈리는 것을 관찰함 — B가 A보다 먼저 처리되면(매물이 아직 `quantityAvailable>0`인 시점에 B의 `eligible` 스냅숏이 찍힘) 페널티를 받고, A보다 나중에 처리되면(A가 이미 소진시킨 뒤 스냅숏이 찍힘) 똑같이 안 산 채로도 페널티를 면제받는다. A는 두 순서 모두에서 항상 구매 성공(B가 그 매물을 건드리지 않으므로). 40개 시드 전부에서 A는 항상 미충족 0건, B는 `true`/`false` 둘 다 관측됨(둘 다 최소 1회 이상) — D-026 후보 설명이 예측한 정확히 그 메커니즘을 다인원 조건에서 처음으로 직접 재현한 것. 공식(`src/engine/simulateGame.ts`)은 관찰만 하고 수정하지 않았으며, 조정 여부는 economy-reviewer 검토·사용자 승인 대기로 TODO.md/DECISIONS.md에 남김. | Milestone 4 1단계(GameSession 다인원 코어) |
| 2026-08-28 | Milestone 4 1단계 검토(오케스트레이터가 직접 1인 플레이 전체 라운드를 브라우저로 재검증 — 콘솔 에러 없음, 리팩터링 전과 동일하게 동작). code-reviewer: id 검증 로직·`getHumanPlayer()` 하위호환·Map 전환/클리어 시점·`isWaitingForHumanInput()` 일반화·D-026 테스트 설계 모두 문제 없음 확인, 임시 스크립트 잔존만 지적(삭제 완료), `MULTIPLAYER_DESIGN.md` 구현 상태 절 갱신 권고(반영 완료). economy-reviewer가 D-026 실측을 시드 1~200으로 확장한 결과 B의 부당한 페널티 발생 비율이 52.5%/47.5%로 사실상 동전 던지기임을 확인했고, 나아가 학급 규모별 "매물 있었는데 못 산" 비율을 직접 측정해 **5명 학급에서도 의류(apparel) 기준 92.0%**(식품은 2.9%→10.0%→26.7%, 5/10/20명)로 이미 상시 조건임을 발견 — "5단계"라는 순서 라벨과 무관하게 **다인원 로비(4단계)로 실제 학생이 붙기 전 필수 선행 작업으로 승격**해야 한다고 권고(TODO.md에 반영, 해결책 A/B/C 후보와 각각의 장단점 포함). 또한 economy-reviewer가 별개 이슈를 새로 발견: `submitCompanyDecision` 등이 "id가 이 세션 소속 학생인가"만 검증하고 **호출자가 실제로 그 학생 본인인지는 검증하지 않음**(다른 학생의 companyId로 제출해도 막히지 않음을 직접 테스트로 확인) — 지금은 네트워크가 없어 실질 위험 0이지만 2단계(로컬 폴링 서버) 설계에 참가자별 인증(세션 토큰 등)을 반드시 포함해야 함, TODO.md 2단계 항목에 반영. 부수 관찰(범위 밖, 조정 제안 없이 기록만): 의류 카테고리가 학급 규모와 무관하게 만성적으로 희소한 것은 D-026과 별개의 기존 밸런스 신호일 수 있음. | Milestone 4 1단계 검토 |
| 2026-08-28 | D-026 해결(사용자 승인된 해결책 A 구현): 필수 소비 페널티 판정 기준을 "가계 처리 시점의 실시간 재고"에서 "그 라운드 소매시장 갱신 직후(가계 소비 시작 전) 공급 스냅샷"으로 변경. `src/engine/simulateGame.ts`의 `RoundAccumulator`에 `roundStartRetailListings` 필드를 추가하고 `runConsumerPurchases`(household-turn/npc-consumer-behavior 공용) 최초 호출 시점에 한 번만 `state.retailListings`를 얕은 복사해 고정, 페널티 판정(`wasAvailable`)만 이 스냅샷 기준으로 재계산하도록 바꿨다. 실제 구매 매칭(실시간 `state.retailListings` 기준)과 페널티 공식(임계값/합산/스무딩)은 무변경. `tests/multiplayer/gameSession.test.ts`의 D-026 테스트를 "처리 순서 무관 결정론적"으로 뒤집어 시드 1~200 전부 통과 확인(가계 A 항상 미충족 0건, 가계 B 항상 페널티). `tests/engine/simulateGameMetrics.test.ts`에 studentCount=2 신규 회귀 테스트 추가(household-turn이 유일한 식품 매물을 소진해도 뒤이은 npc-consumer-behavior의 다른 가계가 스냅샷 기준으로 정상 페널티를 받음 확인), 기존 D-024 단일가계 손계산 테스트 5개는 예측대로 무수정 통과. `typecheck`(양쪽 tsconfig)·`lint --max-warnings=0`·`test`(259개)·`build` 모두 통과. `simulate:class`(seed 42) 재검증: avgCompanyProfit/avgStoreProfit/생존 기업·가게 수는 1/5/10/20명 전 시나리오에서 수정 전후 완전 동일, `finalSatisfaction`만 1명 0.46→0.40, 5명 0.46→0.35, 10명 0.48→0.35, 20명 0.40→0.30으로 하락(0.2 이하로 떨어진 시나리오 없음, 가장 낮은 값 0.30). `validate:economy`(1/5/10/20명×시드 1/42/999) 데이터 무결성 위반 0건, determinism 유지. finalSatisfaction 하락 자체는 새 밸런스 신호이며 추가 조정 없이 수치만 보고(이번 승인 범위 밖). | D-026 확정(해결책 A 구현) |

## 이후 결정이 필요한 미정 사항

아래 항목들은 Milestone 1에서 v1 baseline 수치로 일단 결정했으나(D-018), **최종 확정이 아니라
플레이테스트로 조정될 잠정값**이다 (구체 값은 `src/economy/config.ts`). 조정하려면 임의로 바꾸지
말고 [CLAUDE.md](../CLAUDE.md) 4절 형식으로 먼저 보고한다.

- NPC 전략별 파라미터 값 (v1: `COMPANY_STRATEGY_PRESETS`, `STORE_STRATEGY_PRESETS`,
  `HOUSEHOLD_STRATEGY_PRESETS`)
- NPC 소비자 수 목표 (`NPC_TARGETS.minConsumers`/`consumersPerStore`) — D-023에서 판매자 수
  증가에 맞춰 가게 수 기준으로 재설계했다(해결 완료). 다만 `consumersPerStore=2.5`라는 구체
  배율 자체는 여전히 v1 잠정값이다.
- 상권별 구체 계수 (v1: `DISTRICTS` — 임대료 배율, 기업/가게 적합도. 소비자 수·유통거리는 아직
  모델링하지 않음. **정정(Milestone 3 2단계에서 architect가 발견)**: `DISTRICTS[...].storeSuitability`는
  실제로 `scoreListingForBuyer`(가계의 가게 선택 로직) 어디에서도 참조되지 않는다 — 상권은
  지금 임대료(고정비)에만 영향을 주고 실제 판매/매력도 계산에는 반영되지 않는다. 문서에
  적혀 있던 "가게 적합도가 소매 매력도 가중치로 반영됨"은 사실이 아니었다. `storeAdvisor.ts`는
  이 사실을 반영해 상권을 인과적 조언이 아닌 임대료 배율 사실 정보로만 노출한다. 실제로
  `storeSuitability`를 수요 공식에 반영할지는 별도 승인이 필요한 사안으로 남아 있다.)
- 업종 유사도 매트릭스의 구체 값 (v1: `CATEGORY_SIMILARITY`, 4개 카테고리만 존재)
- 수요/가격 공식의 세부 형태 (v1: 가격 대비 품질 점수 기반 매칭, `src/npc/decisions.ts`의
  `scoreListingForBuyer`) — D-019에서 관찰된 순이익/거래량 추세의 원인 후보이기도 함
- 7라운드 각 라운드의 세부 밸런스 수치 (아직 라운드별 차등 없음 — 4~7라운드의 "사업 확장",
  "경쟁 전략", "시장 변화" 이벤트는 Milestone 1에 포함되지 않음, 모든 라운드가 동일 규칙으로 진행됨)

아래 항목은 여전히 완전히 미정이다:

- 프런트엔드 프레임워크 (React/Svelte/기타) 및 UI 상태관리 방식
- 실시간 동시 턴 동기화 방식 (polling vs WebSocket vs Apps Script 특성상 polling 불가피 여부)
