import type { StorageAdapter } from "./StorageAdapter.js";

/**
 * `window.localStorage`가 실제로 만족하는 부분집합. 이 파일은 `tsconfig.json`(Node 타겟,
 * DOM lib 없음)으로 컴파일되므로 전역 `localStorage` 타입을 직접 참조하지 않는다 — 대신
 * 호출자가 브라우저의 `window.localStorage`(DOM lib이 있는 `src/ui`에서)를 명시적으로
 * 넘기게 한다. 부수 효과로 테스트에서 가짜 스토어를 주입하기도 쉬워진다.
 */
export interface SyncKeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

/**
 * 브라우저 로컬 저장 어댑터 (docs/GOOGLE_SHEETS_ARCHITECTURE.md의 Milestone 2 산출물).
 * `GameSession`이 phase 하나를 완전히 실행하고 난 뒤의 확정된 `GameState` 스냅샷만
 * 저장한다 — phase 도중의 미확정 제출값은 저장 대상이 아니다 (새로고침 시 어중간한 상태로
 * 복원되는 것을 막기 위함).
 */
export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly store: SyncKeyValueStore) {}

  async get<T>(key: string): Promise<T | undefined> {
    const raw = this.store.getItem(key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // 저장된 값이 손상됐거나(수동 편집 등) 예전 스키마라 더 이상 파싱되지 않는 경우,
      // "이어하기 저장분 없음"과 동일하게 취급한다 — 게임을 못 켜지는 상태로 만들지 않는다.
      return undefined;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.setItem(key, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    this.store.removeItem(key);
  }

  async listKeys(prefix = ""): Promise<string[]> {
    const keys: string[] = [];
    for (let i = 0; i < this.store.length; i += 1) {
      const key = this.store.key(i);
      if (key !== null && key.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return keys;
  }
}
