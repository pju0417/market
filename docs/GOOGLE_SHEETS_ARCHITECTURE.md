# GOOGLE_SHEETS_ARCHITECTURE.md

## 목표

이 프로젝트는 개발자 개인만 쓰는 프로그램이 아니라, **다른 교사도 별도 유료 서버 없이 사용할
수 있어야 한다.** 장기 목표는 각 교사가 자신의 Google 계정/Drive로 자기 학급 게임 데이터를
저장하는 분산형 구조다.

```
공통 게임 프런트엔드
      ↓
교사별 Apps Script
      ↓
교사별 Google Sheet
```

## 핵심 원칙: 경제 엔진과 저장소의 분리 (D-014)

- **경제 계산은 항상 TypeScript/JavaScript 엔진 코드에서 수행한다.** Google Sheet는 계산
  엔진이 아니다.
- Google Sheet의 용도: 세션 상태, 플레이어 정보, 기업/가게/가계 상태, 학생 선택, 시장 결과,
  라운드 기록, 교사가 확인 가능한 기록.
- 경제 엔진은 실제 저장 방식이 무엇인지 몰라야 한다 — `StorageAdapter` 인터페이스를 통해서만
  상태를 읽고 쓴다.

## StorageAdapter 계층

```
src/storage/
  StorageAdapter.ts        # 인터페이스 정의 (Milestone 0)
  MemoryStorageAdapter.ts  # 인메모리 구현 (Milestone 0, 테스트/시뮬레이션용)
  LocalStorageAdapter.ts   # 브라우저 로컬 저장 (Milestone 2). GameSession.enableAutoSave()로
                           # 연결되어 phase마다 자동 저장하고, 새로고침 시 ResumePromptScreen이
                           # 이어하기를 제안한다.
  GoogleSheetsAdapter.ts   # Apps Script 연동 (Milestone 5에서 구현)
```

경제 엔진(`src/engine`, `src/economy`)은 `StorageAdapter` 인터페이스 타입에만 의존하고, 구체
구현 클래스를 직접 import하지 않는다. 이렇게 하면 어댑터를 교체해도 엔진 코드는 변경되지 않는다.

## 이번 단계에서 한 것 / 하지 않은 것

- **한 것**: `StorageAdapter` 인터페이스와 `MemoryStorageAdapter`의 최소 구현(세션/키-값 수준의
  범용 저장 기능)만 작성해 인터페이스 계약을 확정한다.
- **하지 않은 것**: 실제 Google Sheets 연동, Apps Script 배포, 인증/권한 처리. 이는
  Milestone 5의 범위다.

## 향후 고려사항 (미정, 결정 시 DECISIONS.md에 D-ID 추가)

- Google Sheets API 호출 방식 (Apps Script Web App vs Sheets API 직접 호출)
- 시트 스키마 (라운드/플레이어/시장 스냅샷을 몇 개의 시트/탭으로 나눌지)
- 동시 쓰기 충돌 처리 (Apps Script는 기본적으로 단일 스레드지만 다수 학생의 동시 제출 처리 필요)
- 오프라인/재접속 시나리오
