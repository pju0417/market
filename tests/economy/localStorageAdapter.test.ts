import { describe, expect, it } from "vitest";
import { LocalStorageAdapter, type SyncKeyValueStore } from "../../src/storage/LocalStorageAdapter.js";

function makeFakeStore(): SyncKeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe("LocalStorageAdapter", () => {
  it("round-trips JSON-serializable values", async () => {
    const adapter = new LocalStorageAdapter(makeFakeStore());

    await adapter.set("round", { value: 3 });

    await expect(adapter.get<{ value: number }>("round")).resolves.toEqual({ value: 3 });
  });

  it("returns undefined for a missing key", async () => {
    const adapter = new LocalStorageAdapter(makeFakeStore());

    await expect(adapter.get("missing")).resolves.toBeUndefined();
  });

  it("deletes values", async () => {
    const adapter = new LocalStorageAdapter(makeFakeStore());
    await adapter.set("temp", "x");

    await adapter.delete("temp");

    await expect(adapter.get("temp")).resolves.toBeUndefined();
  });

  it("lists keys filtered by prefix", async () => {
    const adapter = new LocalStorageAdapter(makeFakeStore());
    await adapter.set("session:1", {});
    await adapter.set("session:2", {});
    await adapter.set("other:1", {});

    const keys = await adapter.listKeys("session:");

    expect(keys.sort()).toEqual(["session:1", "session:2"]);
  });

  it("treats corrupted/unparseable stored JSON as a missing value instead of throwing", async () => {
    const store = makeFakeStore();
    store.setItem("broken", "{not valid json");
    const adapter = new LocalStorageAdapter(store);

    await expect(adapter.get("broken")).resolves.toBeUndefined();
  });
});
