/**
 * 경제 엔진이 실제 저장 방식(메모리/로컬/Google Sheets)을 몰라도 되게 하는 경계.
 * docs/GOOGLE_SHEETS_ARCHITECTURE.md 참고. 엔진 코드는 이 인터페이스 타입에만 의존해야 하며
 * 구체 구현 클래스를 직접 import하지 않는다.
 */
export interface StorageAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  listKeys(prefix?: string): Promise<string[]>;
}
