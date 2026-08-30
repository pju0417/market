/**
 * 요청 하나를 끝까지 처리하는 오케스트레이션 함수 (Milestone 5 2부, D-032). 의존성(게이트웨이/
 * 락/uuid 생성기/실제 라우팅 함수)을 전부 인자로 주입받아, 실제 Apps Script 서비스 없이
 * vitest로 테스트할 수 있다.
 *
 * **핵심 설계 결정**: `src/server/httpApi.ts`의 `handleApiRequest`를 이 파일이 직접 import하지
 * 않고 `DispatchDeps.handleApiRequest`로 주입받는다. 두 가지 이유:
 * 1. 로컬 vitest에는 esbuild alias가 적용되지 않으므로, 진짜 `handleApiRequest`를 주입해
 *    테스트하면 실제 라우팅/검증 로직을 그대로 실행해 볼 수 있다(다만 그 경로는 내부적으로
 *    `./sessionRegistry.js`(로컬 인메모리 세션 레지스트리)를 그대로 참조하므로, 이 테스트는
 *    "라우팅/락/에러 처리 배선이 문제없이 동작한다"만 확인할 뿐 실제 시트 연동 자체는
 *    검증하지 않는다 — 시트 연동은 `sessionRegistryAdapter.test.ts`가 별도로 검증한다).
 * 2. 실제 Apps Script 번들(`scripts/build-apps-script.ts`)은 esbuild `onResolve` 훅으로
 *    `httpApi.ts`가 참조하는 `./sessionRegistry.js`를 `sessionRegistryAdapter.ts`로 치환한
 *    뒤, 그렇게 만들어진 `handleApiRequest`를 `entry.ts`가 그대로 주입한다 — `dispatch.ts`
 *    자체는 이 치환 여부를 몰라도 된다.
 *
 * 이 파일은 `configureSessionRegistryAdapter`/`flushSessionRegistryAdapter`를 요청 시작/종료
 * 시점에 호출해 세션 저장소의 hydrate/flush 생명주기를 관리한다 — 로컬 테스트에서 진짜
 * `handleApiRequest`(별칭이 적용되지 않은 버전)를 주입한 경우 이 두 호출은 아무 세션도
 * 건드리지 않으므로 안전한 no-op이다.
 */
import type { ApiRequest, ApiResponse } from "../server/httpApi.js";
import type { LockLike, SpreadsheetGateway, UuidGenerator } from "./hostInterfaces.js";
import { configureSessionRegistryAdapter, flushSessionRegistryAdapter } from "./sessionRegistryAdapter.js";

export const DEFAULT_LOCK_TIMEOUT_MS = 30_000;

export type HandleApiRequestFn = (request: ApiRequest) => Promise<ApiResponse>;

export interface DispatchDeps {
  gateway: SpreadsheetGateway;
  lock: LockLike;
  uuidGen: UuidGenerator;
  lockTimeoutMs?: number;
  /** `src/server/httpApi.ts`의 `handleApiRequest`(또는 그와 같은 시그니처의 대체 구현). */
  handleApiRequest: HandleApiRequestFn;
}

function lockBusyResponse(): ApiResponse {
  return { status: 503, body: { error: "server is busy handling another request, try again" } };
}

function internalErrorResponse(error: unknown): ApiResponse {
  return { status: 500, body: { error: error instanceof Error ? error.message : "internal error" } };
}

export async function dispatchApiRequest(deps: DispatchDeps, request: ApiRequest): Promise<ApiResponse> {
  try {
    deps.lock.waitLock(deps.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS);
  } catch {
    // LockLike.waitLock throws on timeout (docs/appsScript hostInterfaces.ts) — this is not an
    // exceptional bug, just "someone else is mid-request", so respond instead of propagating.
    return lockBusyResponse();
  }

  try {
    configureSessionRegistryAdapter(deps.gateway, deps.uuidGen);
    const response = await deps.handleApiRequest(request);
    flushSessionRegistryAdapter();
    return response;
  } catch (error) {
    return internalErrorResponse(error);
  } finally {
    deps.lock.releaseLock();
  }
}
