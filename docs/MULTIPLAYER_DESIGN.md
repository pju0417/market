# MULTIPLAYER_DESIGN.md

## 핵심 요구사항

각 라운드에서 같은 역할(기업/가게/가계)의 턴은 **전원이 동시에** 수행한다. 특정 학생이 다른
학생의 턴 종료를 기다리는 구조를 만들지 않는다 (D-013, [ROUND_FLOW.md](ROUND_FLOW.md)).
따라서 멀티플레이 구조는 순번 기반이 아니라 **"단계(phase) 기반 동시 처리"**여야 한다:

1. 현재 라운드의 현재 phase(예: 기업 턴)에서 모든 참가자가 각자 독립적으로 입력을 제출한다.
2. 전원(또는 시간 제한)이 제출을 마치면 phase를 확정하고 다음 단계(도매시장 갱신 등)로 넘어간다.
3. 한 참가자의 입력이 다른 참가자의 입력을 실시간으로 보지 못하게 한다 (동시성 보장 —
   가게가 서로의 매입 결정을 미리 보고 담합하지 않도록).

## 장기 목표 구조

```
공통 게임 프런트엔드
      ↓
교사별 Apps Script
      ↓
교사별 Google Sheet
```

각 교사가 자신의 Google 계정/Drive로 자기 학급 데이터를 저장하는 분산 구조를 목표로 한다
(D-015). 이번 단계에서는 실제 네트워크/동기화 구현을 하지 않으며, `src/multiplayer/`는
세션·턴 제출 상태를 다룰 책임 영역으로만 정의한다.

## 저장소와의 관계

멀티플레이 동기화 로직은 실제 저장 방식(`StorageAdapter`)에 의존하지 않아야 한다. 로컬
프로토타입(Milestone 2)에서는 `MemoryStorageAdapter` 또는 `LocalStorageAdapter`로 동작하고,
장기적으로는 `GoogleSheetsAdapter`로 교체되어도 상위 로직이 바뀌지 않아야 한다
([GOOGLE_SHEETS_ARCHITECTURE.md](GOOGLE_SHEETS_ARCHITECTURE.md)).

## 담합/부정 방지 고려사항

- 가게→가계 거래 시 필요하면 판매자 신원을 익명화한다 (GAME_RULES.md 2절).
- 동시 제출 원칙상 한 역할의 턴이 끝나기 전에는 다른 참가자의 미확정 입력을 노출하지 않는다.

## 구현 상태 (Milestone 2)

`src/multiplayer/GameSession.ts`가 "제출 상태 관리 + phase 진행 제어" 책임을 처음으로
구현했다 — 단, **로컬(단일 기기, 네트워크 없음), 학생 1명 범위**다 (D-021). phase 하나가
실제로 실행되는 순간까지 제출된 결정을 노출하지 않는다는 원칙(위 3번)은 이미 지켜지고
있다 — `GameSession`은 제출값을 내부 필드에 버퍼링만 하고, `advancePhase()`가 실제로
`RoundEngine.stepPhase()`를 호출할 때에만 시장 로직에 반영된다.

## 구현 상태 (Milestone 4 1단계)

`GameSession`을 다인원 코어로 리팩터링했다 — 단일 `humanPlayer`/제출 필드 3개를
`humanPlayers: readonly PlayerState[]`와 참가자 id를 key로 하는 `Map` 3개로 바꿔,
`submitCompanyDecision(companyId, input)`처럼 **어느 참가자의 제출인지 인자로 명시**하는
방식으로 바뀌었다. `RoundEngine`/`simulateGame.ts`는 애초에 참가자 id로 조회하는
`HumanDecisionSource` 인터페이스로 설계돼 있어 전혀 손대지 않았다 — 갭은 `GameSession`
한 클래스에만 있었다. 다만 이번 단계는 **네트워크가 없는 로컬 프로세스 안에서만** 다인원을
지원한다(자동화 테스트로만 검증됨, UI/로비는 여전히 1인만 노출). 위 3번 원칙(제출 전
비공개)은 서버가 없는 한 자동으로 지켜지지만, 서버가 생기면(2단계 이후) "다른 참가자의
제출 여부/내용을 API로 알아낼 수 있는가"라는 새 위협 모델을 다시 검토해야 한다.

이 리팩터링 과정에서 D-026(후보, 필수 소비 만족도 페널티가 같은 라운드 내 처리 순서에
좌우되는 문제)의 메커니즘이 여러 실제 참가자가 동시에 household-turn을 수행하는 조건에서
실제로 재현됨을 확인했다 — 상세는 docs/DECISIONS.md 참고. 공식은 아직 수정하지 않았다.

진짜 네트워크 동기화(여러 기기, 여러 학생이 동시에 접속)와 "제출 안 한 참가자 목록" 같은
다인원 모니터링 UI, 다인원 창업 준비(로비)는 여전히 Milestone 4의 다음 단계(2~4단계,
docs/TODO.md 참고) 범위다.

## 구현 상태 (Milestone 4 2단계)

`src/server/`에 "여러 기기/탭이 하나의 `GameSession`을 공유"하는 첫 실제 네트워크 계층이
생겼다 — HTTP 폴링 기반이며 WebSocket 등 실시간 푸시는 쓰지 않는다. D-028에서 확정한 대로
이 서버는 로컬 전용 임시 기능이 아니라 **Google Apps Script Web App으로 포팅될 프로토타입**
으로 설계했다: 실제 라우팅/인증/게임 진행 로직(`src/server/httpApi.ts`)은 Node의 raw
request/response 타입을 전혀 참조하지 않는 순수 함수 `handleApiRequest(ApiRequest) =>
Promise<ApiResponse>`이고, Node 전용 배관(JSON body 스트림 읽기, URL 파싱, 실제
`http.RequestListener`로 감싸기)은 `src/server/nodeAdapter.ts` 한 파일에만 몰아넣었다.
서버 진입점은 standalone Node 프로세스가 아니라 Vite 플러그인
(`src/server/viteApiPlugin.ts`, `configureServer`/`configurePreviewServer`)으로 `/api`를
마운트하는 방식을 택했다 — 이미 `npm run dev`/`npm run preview`로 띄우는 서버가 있으므로
별도 서버 프로세스를 늘리지 않는다.

**세션 레지스트리**(`src/server/sessionRegistry.ts`)는 `Map<sessionId, {session, tokens}>`
로 여러 `GameSession`을 동시에 들 수 있게 설계했다 — 교사 1명당 세션 1개로 좁힐지 여러
학급을 동시 지원할지는 아직 정하지 않았지만, Map 방식은 구현 비용이 거의 없고 나중에
단일 세션으로 좁히기도 쉽다.

**참가자 인증**(`src/server/tokenStore.ts`)은 Milestone 4 1단계에서 economy-reviewer가
지적한 "id 소속 검증만 있고 호출자 본인 확인이 없다"는 위협을 실제로 막는다 — `join` 시
참가자별 토큰을 발급하고(loose join: 같은 playerId로 재join해도 매번 새 토큰, 기존 토큰
무효화 없음 — 여러 탭/새로고침 허용), 매 제출 요청은 `Authorization: Bearer <token>`을
싣고, 서버가 "토큰이 바인딩된 playerId가 소유한 companyId/storeId/householdId"와 "요청
본문의 id"가 일치하는지 검증한다(불일치·토큰 없음 시 401/403). **이건 "같은 교실 반신뢰
환경에서 실수/장난 방지" 수준이며 TLS·토큰 만료/rotate 같은 프로덕션급 보안은 범위 밖이다.**

**담합 방지 원칙(위 3번)이 실제 응답 형태에서도 지켜지는지 자동화 테스트로 고정**했다 —
`GET /api/sessions/:id/state`는 `session.getState()` + `getVersion()` +
`getUnsubmittedParticipantIds()`만 반환한다. `GameState`는 애초에 phase가 실제로 실행된
뒤의 확정 상태만 담고(제출 대기 중인 값은 `GameSession` 내부 `Map`에만 버퍼링, Milestone 2
때부터 있던 성질), `getUnsubmittedParticipantIds()`도 "누가 아직 제출 안 했는지" id만
드러낼 뿐 내용은 노출하지 않는다 — 회귀 테스트(`tests/server/httpApi.test.ts`,
`tests/server/integration.test.ts`)로 "A가 제출한 직후 B가 폴링한 응답을 통째로
`JSON.stringify`해도 A가 제출한 수량/가격이 전혀 등장하지 않음"을 고정했다.

각 `submit/*`가 성공하면 서버가 자동으로 `GameSession.advanceUntilInputRequired(false)`를
호출해, 사람 입력이 필요 없는 phase(정산/시장 갱신 등)를 클라이언트 없이 조용히 끝까지
드레인한다 — `src/ui/App.tsx`의 `SILENT_AUTO_PHASES` 자동 진행과 정책은 같지만, 그 UI
이펙트 경로 자체는 이번 단계에서 전혀 건드리지 않았다(여전히 로컬 1인 세션만 그린다).
`force=true`를 노출하는 공개 엔드포인트는 만들지 않았다(제출 타임아웃 정책은 3단계 범위).

검증은 두 층위로 했다: (1) 서버를 띄우지 않고 `handleApiRequest`를 직접 호출하는 유닛
테스트 13개, (2) `http.createServer(nodeAdapter(...)).listen(0)` + Node 18+ 전역 `fetch`로
실제 TCP를 거쳐 두 "가상 학생" 클라이언트가 join → 제출(스푸핑 시도 거부 확인 포함) →
폴링 → 양쪽 제출 후 실제 phase 전환 확인 → store/household 턴까지 진행해 라운드 1이 실제로
정산되는 것까지 확인하는 통합 테스트 2개. 세 턴 화면(`CompanyTurnScreen` 등)의 제출 호출부를
실제 네트워크 호출로 바꾸는 작업(async 전환, 원격 세션을 구독하는 클라이언트 훅)은 의도적으로
이번 범위에 넣지 않았다 — 4단계(다인원 로비)와 함께 다룬다. 상세 검증 수치는
docs/TODO.md Milestone 4 2단계 항목, 로드맵 결정 배경은 docs/DECISIONS.md D-028 참고.

## 구현 상태 (Milestone 4 3단계)

D-029에서 확정한 대로 **타임아웃/강제진행/제출현황은 서버 로직(`src/server/`)에만
구현**했고, 확인용 클라이언트도 기존 로컬 1인 플레이 경로(App.tsx, useGameSession.ts,
CompanyTurnScreen/StoreTurnScreen/HouseholdTurnScreen)와 완전히 분리된 별도 파일로만
추가했다 — 그 로컬 경로는 이번에도 한 글자도 바꾸지 않았다.

**제출 타임아웃 (하이브리드 정책, D-029 C안)**: `src/server/timeoutConfig.ts`의
`DEFAULT_SUBMISSION_TIMEOUT_MS`(120초, v1 잠정값)가 지나면, 그 다음 `GET /state` 폴링
응답을 만들기 **전에** 서버가 자동으로 미제출 phase를 봇 폴백 경로로 강제진행한다.
`src/server/sessionRegistry.ts`의 `SessionEntry`에 `phaseStartedAt`/`lastObservedPhase`를
추가하고, 헬퍼 `syncPhaseTimer(entry)`가 "phase가 실제로 바뀌었을 때만" 타이머를 리셋한다
— 부분 제출(`submitCompanyDecision` 등)은 phase를 바꾸지 않으므로 반복 제출로 다른
참가자의 타임아웃을 늦출 수 없다(회귀 테스트로 고정).

강제진행 구현은 architect가 사전에 지적한 함정(`GameSession.advanceUntilInputRequired(force)`가
"이미 막혀서 대기 중인 phase" 자체에는 force를 적용하지 않는 while 조건)을 피하기 위해
반드시 `advancePhase(true)`(막힌 phase를 뚫음) → `advanceUntilInputRequired(false)`(그
다음 조용한 phase들을 드레인) 순서로 호출한다 — 이 두 곳(자동 타임아웃, 아래 수동
강제진행)에서 모두 같은 순서를 지켰다.

**순서 버그 방지(가장 중요한 회귀 지점)**: `handleState`는 `since` 버전 비교보다
**먼저** 타임아웃 체크를 실행해야 한다. 반대 순서면 아무도 새로 제출하지 않는 세션은
클라이언트가 보낸 `since`가 항상 서버의 현재 버전과 같아 매번 `{unchanged:true}`
빠른 경로로 즉시 반환되어 타임아웃 체크 자체가 실행되지 않는다 — 즉 "폴링은 계속 오는데
아무도 제출을 안 하면 영원히 멈춰 있는" 조용한 버그가 된다. `tests/server/httpApi.test.ts`에
`vi.useFakeTimers()`로 이 정확한 시나리오(클라이언트가 `since=자신이 이미 아는 버전`을
마감 경과 후에도 계속 보냄)를 고정하는 회귀 테스트를 추가했다.

**교사 수동 강제진행**: 세션 생성(`POST /api/sessions`) 응답에 `teacherToken`을 딱 한 번
포함한다 — `GET /slots` 등 다른 어떤 라우트도 이 값을 다시 노출하지 않는다(회귀 테스트로
직접 확인). `POST /api/sessions/:id/force-advance`는 `Authorization: Bearer
<teacherToken>`이 정확히 일치해야 하고(불일치·누락·참가자 토큰으로 시도 401), 게임이
이미 끝났으면 오류가 아니라 no-op `200 {ok:true, gameOver:true}`를 반환한다(폴링/버튼
재클릭으로 뒤늦게 도착한 요청을 사용자에게 에러로 보여주지 않기 위한 선택).

**확인용 클라이언트(프로덕션 화면과 무관)**: `src/ui/network/sessionClient.ts`(`fetch`를
주입받는 얇은 래퍼, DOM 비의존), `src/ui/network/submissionStatus.ts`(순수 함수
`computeUnsubmittedParticipants` — `GET /slots`와 `GET /state`의
`unsubmittedParticipantIds`+현재 phase를 조합해 "아직 제출 안 한 참가자" 목록을 계산),
`src/ui/screens/NetworkSessionMonitor.tsx`(현재 phase, 제출 현황, 남은 시간(추정 —
서버가 마감시각 자체를 API로 노출하지 않으므로 이 화면이 phase 전환을 처음 관찰한 시각
기준의 참고용 표시일 뿐이고, 실제 타임아웃 판정은 서버의 `phaseStartedAt`이 독립적으로
한다), 교사 토큰이 있을 때만 보이는 "지금 진행" 버튼). 이번 단계는 이 컴포넌트를 만들기만
하고 `App.tsx`/`useGameSession.ts`/세 턴 화면에는 배선하지 않았다 — Milestone 4 4단계
(다인원 로비)에서 재사용할 예정이다. 교사 토큰은 `sessionStorage`에 저장한다
(`localStorage`가 아님 — 탭 간 세션/토큰 공유를 막고, `LocalStorageAdapter`가 쓰는 고정
키와 충돌하지 않기 위함).

검증: `tests/server/httpApi.test.ts`에 `vi.useFakeTimers()` 기반 신규 테스트 7개(teacherToken
발급/무유출, 플레이어 토큰 force-advance 401, force-advance가 미제출 phase를 실제로
넘기는지, 게임 종료 후 no-op, 순서 버그 회귀, 마감 직전 실제 제출값이 봇 값으로 덮이지
않는지, 부분 제출이 타이머를 리셋하지 않는지), `tests/server/integration.test.ts`에 실제
TCP + `Promise.all` 동시 제출 테스트 1개(중복 정산·유실 없음), 신규
`tests/ui/submissionStatus.test.ts`(DOM 없는 순수 함수 테스트 5개). 전체 293개 테스트
(기존 280 + 신규 13) 통과, `npm run typecheck`(양쪽 tsconfig)·`npm run lint --
--max-warnings=0`·`npm run build`(65 모듈, 신규 UI 파일이 번들에 섞이지 않음) 모두 클린.
`src/engine`/`src/economy`/`src/npc`/`src/advisor`/`GameSession.ts`는 무변경(`git diff`로
확인) — 기존 `advancePhase`/`advanceUntilInputRequired`/`isWaitingForHumanInput`/
`getUnsubmittedParticipantIds`만으로 충분해 `GameSession`에 새 메서드를 추가하지 않았다.
상세 근거는 docs/DECISIONS.md D-029 참고.

## 구현 상태 (Milestone 4 4단계)

**round-result만의 국지적 예외(D-030)**: "한 학생이 다른 학생의 턴 종료를 기다리지 않는다"는
원칙은 company/store/household-turn에는 그대로 유지되지만, 라운드 결과 확인
(round-result phase)만은 예외적으로 전원이 "확인(ack)"해야 다음 라운드의 company-turn으로
넘어간다 — "모두가 같은 속도로 라운드 결과를 함께 확인한다"는 교육적 경험을 사용자가
우선한 선택이다. `GameSession.ts`에 확인 여부만 담는 `acknowledgedRoundResultPlayerIds`와
신규 메서드 `acknowledgeRoundResult(playerId)`를 추가했고, `getUnsubmittedParticipantIds()`의
`"round-result"` 케이스가 실제 게이트다. round-result 대기 자체는 D-029의 120초 자동
타임아웃 정책을 상속하지 않는다(교사의 수동 강제진행만 유효) — 결과를 읽는 시간에 제출
리듬을 강제하지 않기 위함이다.

**다인원 로비(D-030 4-b)**: 세션 생성 시 열리고, 학생 전원이 `/setup`(상권/업종 선택)을
제출하거나 교사가 `/close-lobby`로 명시적으로 닫거나 `DEFAULT_LOBBY_TIMEOUT_MS`(180초)를
넘기면 닫힌다(`isLobbyOpen`). 로비가 열려있는 동안은 `submit/company`가 거부되어, 창업
준비가 끝나기 전에 라운드 1 기업 턴이 시작될 수 없다. `GET /state`의 `lobby` 필드로
클라이언트가 열림 여부와 미제출자 목록을 관찰한다.

**유령 학생 처리(D-031)**: 교사가 `studentCount`를 실제 접속 인원보다 크게 잡으면, 로비가
실제로 닫히는 순간까지 `/setup`을 제출하지 않은 학생은 그 순간부터 이 세션에서 "사람 입력을
기다려야 할 참가자" 목록에서 영구히 제외된다(`GameSession.finalizeLobbyMembership`). 매
라운드 round-result에서 교사가 유령을 대신해 수동 강제진행할 필요가 없어진다 — 이후 그
참가자의 회사/가게/가계는 기존 봇 폴백 경로로만 진행된다. 트레이드오프 두 가지(유령의
`kind`는 여전히 `"student"`라 NPC 우선순위 가산점 대상이 아님, 한 번 유령이 되면 그 게임
안에서는 재접속해도 사람으로 복귀할 수 없음)는 재검토 여지가 있는 것으로 명시적으로
기록해 두었다. 상세 근거는 docs/DECISIONS.md D-030/D-031 참고.
