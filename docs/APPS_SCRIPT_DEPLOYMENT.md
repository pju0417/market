# Apps Script 배포 가이드 (초안)

이 문서는 Milestone 5(D-032)에서 준비한 Apps Script Web App 코드를 **실제 Google 계정에
배포**하려는 사용자를 위한 단계별 안내다. 이 저장소 안에서는 검증할 수 없는 단계이므로,
아래 순서는 공개 문서/일반적인 Apps Script Web App 배포 절차를 근거로 작성했다 —
**실제로 한 번도 이 순서대로 배포해본 적이 없다는 뜻이다.** 이 문서 자체가 "배포 완료"를
의미하지 않으며, 실제 배포 후 문제가 생기면 이 문서를 갱신해야 한다.

관련 결정: [DECISIONS.md의 D-032](DECISIONS.md), 설계 배경:
[GOOGLE_SHEETS_ARCHITECTURE.md](GOOGLE_SHEETS_ARCHITECTURE.md).

## 0. 범위

**이 문서가 다루는 것**: 이미 구현된 `src/appsScript/*` 코드를 Apps Script 프로젝트에
올리고 Web App으로 배포해 `.../exec` URL을 얻는 절차.

**이 문서가 다루지 않는 것**:
- 학교/교육청의 Google Workspace 정책 검토(6번 단계에서 언급하는 접근 권한 설정이
  기관 정책에 맞는지는 사용자가 직접 확인해야 한다).
- 실제 Google 계정으로 배포한 `.../exec` URL을 이 저장소의 화면(8번 단계)에 붙여 넣어
  진행한 end-to-end 검증. 화면 배선 자체는 이미 구현되어 있지만(8번 단계 참고), 실제
  배포된 URL로 학생/교사 화면을 끝까지 눌러본 적은 없다 — 이 개발 환경에는 Google
  계정/브라우저 접근이 없어 근본적으로 검증 불가능하다.

## 1. 사전 준비물

- Google 계정 1개 (개인 계정도 가능, 학교 Workspace 계정이면 조직 정책에 따라 일부 배포
  옵션이 관리자에 의해 제한될 수 있다).
- 새 Google Sheets 스프레드시트 1개. **탭을 미리 만들 필요는 없다** — `src/appsScript/entry.ts`의
  `getSheet()`가 `getSheetByName(name) ?? insertSheet(name)`으로 필요한 탭
  (`Sessions`/`LiveState`/`PendingSubmissions`/`RoundMetrics`/`RoundSummary`/`Tokens`,
  `src/appsScript/sheetSchema.ts` 참고)을 세션이 처음 만들어질 때 자동으로 생성한다. 헤더
  행도 그 탭에 처음 쓰기가 일어날 때 자동으로 붙는다(`entry.ts`의 `ensureHeader`).
- 이 저장소를 클론한 로컬 개발 환경(`npm install` 완료 상태).

## 2. 번들 빌드

```bash
npm run build:apps-script
```

`dist/apps-script/Code.gs.js` 파일 하나가 생성된다(esbuild로 `src/appsScript/entry.ts`를
IIFE 하나로 번들링한 결과, `scripts/build-apps-script.ts`). 이 파일 전체가 다음 단계에서
Apps Script 에디터에 그대로 붙여넣을 코드다. `tests/appsScript/bundle.test.ts`가 이미
`import`/`export`/`require` 토큰이 없고 `doGet`/`doPost`가 전역에 노출되는 것까지
확인하지만, **Apps Script 런타임에서 실제로 로드/실행되는지는 이 시점까지 전혀 검증되지
않았다.**

## 3. Apps Script 프로젝트 만들기

1번의 스프레드시트를 열고 메뉴에서 **확장 프로그램 → Apps Script**를 선택한다. 스프레드시트에
바인딩된 새 Apps Script 프로젝트가 열린다(이게 중요하다 — 독립 프로젝트가 아니라 이
스프레드시트에 바인딩된 프로젝트여야 `SpreadsheetApp.getActiveSpreadsheet()`가 올바른
시트를 가리킨다).

기본으로 생성된 `Code.gs` 파일을 열어 내용을 전부 지우고, 2번 단계에서 만든
`dist/apps-script/Code.gs.js`의 전체 내용을 붙여넣는다.

## 4. 매니페스트 설정

Apps Script 에디터 왼쪽의 프로젝트 설정(톱니바퀴 아이콘)에서 "appsscript.json 매니페스트
파일을 편집기에서 보기"를 켠 뒤, 파일 목록에 나타난 `appsscript.json`을 열어
`src/appsScript/appsscript.manifest.example.json`의 내용으로 교체한다:

```json
{
  "timeZone": "Asia/Seoul",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

**`webapp.executeAs`/`webapp.access`의 실제 의미를 반드시 이해하고 넘어가라**:
- `executeAs: "USER_DEPLOYING"` — Web App에 오는 모든 요청이 배포한 사람(교사) 계정
  권한으로 실행된다. 즉 학생은 자기 Google 계정으로 로그인할 필요가 없고, 스프레드시트
  접근 권한도 학생에게 따로 줄 필요가 없다(D-032가 애초에 이 방식을 고른 이유이기도 하다
  — 학생이 교사의 인증정보를 들고 있을 필요가 없다).
- `access: "ANYONE_ANONYMOUS"` — 로그인 없이 URL만 알면 누구나 요청을 보낼 수 있다는
  뜻이다. 학생이 별도 로그인 없이 접속하게 하려면 필요하지만, **학교/교육청의 Google
  Workspace 정책이 조직 외부 익명 접근을 막아두었다면 관리자가 이 옵션 자체를 배포 시점에
  차단할 수 있다** — 이건 이 저장소의 코드로 해결할 수 있는 문제가 아니라, 배포 전에
  사용자가 학교 IT/관리자와 직접 확인해야 하는 사항이다.

## 5. Web App으로 배포

에디터 오른쪽 위 **배포 → 새 배포**를 선택한다. 유형에서 **웹 앱**을 고르고, 4번에서 설정한
실행 사용자/액세스 권한이 그대로 반영됐는지 확인한 뒤 배포한다. 완료되면 `.../exec`로
끝나는 URL이 발급된다 — 이 URL이 `AppsScriptSessionClient`의 `webAppUrl` 생성자 인자로
들어갈 값이다. **안전하게 보관해라(비밀은 아니지만, 재발급하려면 새 배포를 만들어야 하고
그러면 URL이 바뀐다).**

## 6. 배포 직후 수동 스모크 테스트

화면 배선 이전에, 발급된 URL이 실제로 동작하는지 최소한으로 확인한다.

**GET 라우트는 브라우저 주소창에서 바로 확인할 수 있다.** 예를 들어 세션 슬롯 조회는
`path` 쿼리 파라미터만 있으면 되므로:

```
https://script.google.com/macros/s/여기에실제ID/exec?path=/api/sessions/존재하지않는id/slots
```

이렇게 접속했을 때 `{"status":404,"body":{"error":"..."}}` 같은 JSON이 그대로 화면에
표시되면(HTML 로그인 페이지나 Google 오류 페이지가 아니라) 라우팅/직렬화 경로가 최소한
살아있다는 뜻이다.

**POST 라우트**(세션 생성 등)는 브라우저 주소창으로는 확인할 수 없다 — `curl`이나 Postman
등으로 확인한다:

```bash
curl -X POST "https://script.google.com/macros/s/여기에실제ID/exec" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"path":"/api/sessions","body":{"studentCount":2}}'
```

`{"status":201,"body":{"sessionId":"...", ...}}` 형태의 응답이 오는지 확인한다. 이 응답이
왔다면 스프레드시트의 `Sessions`/`LiveState`/`Tokens` 탭이 자동으로 생성돼 있는지도 직접
열어서 확인해본다(5번의 시트 자동 생성 동작 재확인).

## 7. 재배포 시 주의

Apps Script 에디터에서 코드를 저장하는 것만으로는 이미 발급된 `.../exec` URL의 동작이
바뀌지 않는다. 코드를 바꿀 때마다(예: 이 저장소에서 새로 `npm run build:apps-script`를
돌려 갱신된 번들을 붙여넣었을 때) **배포 → 배포 관리 → 기존 배포의 연필(수정) 아이콘 →
버전: 새 버전 → 배포**를 통해 새 버전을 명시적으로 배포해야 라이브 URL에 반영된다.

## 8. 화면에서 실제로 URL 사용하기

여기까지 마치면 동작하는 `.../exec` URL이 생긴다(발급됐다고 "정상 동작"까지 확인된 건
아니다 — 6번 단계의 스모크 테스트로 최소한만 확인한 상태). Milestone 5 3부에서 화면 배선이
실제로 구현됐다 — 게임 화면에서 이 URL을 다음 순서로 사용한다:

1. 게임 첫 화면에서 **"함께 하기"**를 누른다.
2. **"어떤 서버로 접속할까요?"** 화면(`NetworkBackendSelectScreen`)에서 **"Apps Script
   웹앱 URL로 접속"**을 고른다. (기본 선택지인 "같은 Wi-Fi/기기의 로컬 서버"는 기존
   `SessionClient`/로컬 `src/server` 경로 그대로다 — Apps Script와 무관하다.)
3. 5번 단계에서 발급받은 `.../exec` URL을 입력하고 확인을 누른다. 입력값은
   `parseAppsScriptWebAppUrl`(`src/ui/network/parseAppsScriptWebAppUrl.ts`)이 검증한다 —
   빈 문자열은 거부하고, `https://`로 시작하지 않으면 거부한다. `/exec`로 끝나지 않아도
   막지는 않지만(교사가 다른 형태의 배포 URL을 쓸 수도 있어 소프트 체크로만 둠) 화면에
   경고 문구를 보여준다.
4. 확인되면 기존과 동일한 "교사로 세션 만들기" / "학생으로 참가" 역할 선택 화면으로
   넘어간다. 이후 흐름(세션 만들기·참가·창업 준비·라운드 진행)은 로컬 서버 경로와
   화면 구성이 동일하지만, 내부적으로는 `AppsScriptSessionClient`/
   `AppsScriptDecisionSubmitter`와 그 전용 화면들
   (`AppsScriptTeacherSessionScreen`/`AppsScriptNetworkJoinScreen`/
   `AppsScriptNetworkLobbyScreen`/`AppsScriptNetworkGameScreen`,
   `src/ui/screens/`)이 대신 쓰인다 — 로컬 서버용 4개 화면(`TeacherSessionScreen` 등)은
   전혀 건드리지 않고 형제 파일로 복제했다.

**이 저장소 안에서 검증한 것**: 위 화면들의 타입체크·lint·유닛 테스트·빌드(번들에 실제로
포함되는지)까지다. **검증하지 못한 것**: 실제로 배포된 `.../exec` URL을 이 화면에 붙여
넣어 학생 여러 명이 끝까지 게임을 진행해보는 end-to-end 시나리오 — 이 개발 환경에는 실제
Google 계정/브라우저가 없어 근본적으로 검증 불가능하다. 9번 단계의 미검증 리스크 목록
(특히 CORS/리다이렉트, `LockService` 동시성, 폴링 할당량)은 여전히 유효하며, 실제 배포
후 반드시 확인해야 한다.

## 9. 배포 후 반드시 확인해야 할 미검증 리스크 목록

이 저장소 안에서는 확인할 방법이 없어 코드 주석으로만 남겨둔 항목들이다. 실제 배포 직후
가장 먼저 확인해라:

1. **`async`/Promise가 실제로 await되는가** (`src/appsScript/entry.ts`의 `doGetImpl`/
   `doPostImpl`) — Apps Script가 `doGet`/`doPost`의 반환값이 Promise일 때 실제로 그 완료를
   기다린 뒤 응답을 내려보내는지, 아니면 즉시 미완성 상태로 응답해버리는지 문서/커뮤니티
   사례가 엇갈린다. 6번 단계의 세션 생성 테스트가 매번 완전한 JSON을 정상적으로 돌려주는지가
   1차 확인 방법이다 — 만약 응답이 비어있거나 불완전하게 온다면 이 문제일 가능성이 높다.
2. **CORS/리다이렉트 동작** — `.../exec` URL은 실제로는 `googleusercontent.com`으로
   리다이렉트되는 경우가 있다고 알려져 있다. 브라우저에서 `fetch`로 직접 호출했을 때
   (화면 배선 이후) 리다이렉트를 따라가며 CORS 오류 없이 응답을 받아오는지 확인이 필요하다.
   `AppsScriptSessionClient`는 커스텀 헤더를 쓰지 않고 POST는 `text/plain` content-type을
   써서 위험을 낮췄지만(D-032 참고), 실제로 막히지 않는지는 배포 후에만 알 수 있다.
3. **`LockService` 동시성 실측** — 여러 학생이 거의 동시에 제출할 때 `LockService.getScriptLock()`이
   기대한 대로 직렬화해주는지, 락 대기 타임아웃(`dispatch.ts`)이 실제 부하에서 너무
   짧거나 길지는 않은지.
4. **실행 시간/할당량 한도** — Apps Script Web App은 실행 시간(스크립트당, 하루 트리거
   횟수 등)에 제한이 있다. 한 학급(예: 20명)이 몇 초 간격으로 계속 폴링(`GET /state`)할 때
   이 한도에 걸리지는 않는지 실측이 필요하다.
5. **`SpreadsheetApp` 응답 속도** — 시트 읽기/쓰기는 인메모리 `Map`(로컬 서버)보다 훨씬
   느리다. 셀 문자수 한도는 Milestone 5 1부에서 이미 검증했지만(`sheetSchema.test.ts`),
   실제 응답 지연이 학생이 체감할 정도인지는 배포 후에만 알 수 있다.

문제가 발견되면 이 문서의 해당 단계를 갱신하고, 필요하면 `docs/DECISIONS.md`에 새 항목
(D-033 이후)으로 원인/해결책을 기록한다.
