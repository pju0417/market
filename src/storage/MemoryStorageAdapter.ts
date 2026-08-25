import type { StorageAdapter } from "./StorageAdapter.js";

/**
 * 최소 인메모리 구현. 테스트/시뮬레이션 기본 어댑터로 쓴다.
 * LocalStorageAdapter, GoogleSheetsAdapter는 향후 같은 인터페이스로 추가된다
 * (docs/GOOGLE_SHEETS_ARCHITECTURE.md).
 */
export class MemoryStorageAdapter implements StorageAdapter {
  private readonly store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async listKeys(prefix = ""): Promise<string[]> {
    return [...this.store.keys()].filter((key) => key.startsWith(prefix));
  }
}
