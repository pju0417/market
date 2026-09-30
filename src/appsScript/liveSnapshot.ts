import type { SpreadsheetGateway } from "./hostInterfaces.js";
import { LIVE_STATE_SHEET } from "./sheetSchema.js";

/** Oversized classroom states span cells. The manifest is published only after all chunks exist. */
const CHUNK_SIZE = 40_000;
const CHUNK_SHEET = "LiveStateChunks";
interface ChunkManifest { liveChunksV1: string[] }

function manifest(json: string): ChunkManifest | undefined {
  const value = JSON.parse(json) as Partial<ChunkManifest>;
  return Array.isArray(value.liveChunksV1) ? value as ChunkManifest : undefined;
}

export function readLiveSnapshot(gateway: SpreadsheetGateway, json: string): string {
  const chunks = manifest(json);
  if (!chunks) return json;
  return chunks.liveChunksV1.map(id => {
    const row = gateway.findRow(CHUNK_SHEET, "id", id);
    if (!row) throw new Error("저장된 게임 일부를 읽지 못했어요. 다시 접속해 주세요.");
    return row.json!;
  }).join("");
}

export function writeLiveSnapshot(gateway: SpreadsheetGateway, sessionId: string, json: string): void {
  const previous = gateway.findRow(LIVE_STATE_SHEET, "sessionId", sessionId)?.json;
  if (previous && readLiveSnapshot(gateway, previous) === json) return;
  const oldChunks = previous ? manifest(previous)?.liveChunksV1 ?? [] : [];
  let stored = json;
  if (json.length > CHUNK_SIZE) {
    const generation = `${sessionId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ids: string[] = [];
    for (let offset = 0; offset < json.length; offset += CHUNK_SIZE) {
      const id = `${generation}-${offset}`;
      gateway.upsertRow(CHUNK_SHEET, "id", id, { id, json: json.slice(offset, offset + CHUNK_SIZE) });
      ids.push(id);
    }
    stored = JSON.stringify({ liveChunksV1: ids } satisfies ChunkManifest);
  }
  gateway.upsertRow(LIVE_STATE_SHEET, "sessionId", sessionId, { sessionId, json: stored });
  // Cleanup is optional; never turn a committed purchase into a reported failure.
  for (const id of oldChunks) {
    try { gateway.deleteRow(CHUNK_SHEET, "id", id); } catch { /* next maintenance may reclaim it */ }
  }
}
