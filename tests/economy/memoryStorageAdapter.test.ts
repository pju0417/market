import { describe, expect, it } from "vitest";
import { MemoryStorageAdapter } from "../../src/storage/MemoryStorageAdapter.js";

describe("MemoryStorageAdapter", () => {
  it("stores and retrieves values by key", async () => {
    const storage = new MemoryStorageAdapter();

    await storage.set("round", 3);

    await expect(storage.get<number>("round")).resolves.toBe(3);
  });

  it("returns undefined for missing keys", async () => {
    const storage = new MemoryStorageAdapter();

    await expect(storage.get("missing")).resolves.toBeUndefined();
  });

  it("deletes values", async () => {
    const storage = new MemoryStorageAdapter();
    await storage.set("temp", "x");

    await storage.delete("temp");

    await expect(storage.get("temp")).resolves.toBeUndefined();
  });

  it("lists keys filtered by prefix", async () => {
    const storage = new MemoryStorageAdapter();
    await storage.set("player:1", {});
    await storage.set("player:2", {});
    await storage.set("market:1", {});

    const keys = await storage.listKeys("player:");

    expect(keys.sort()).toEqual(["player:1", "player:2"]);
  });
});
