/**
 * `httpApi.ts`의 순수 함수를 실제 `http.RequestListener`로 감싸는 얇은 어댑터
 * (Milestone 4 2단계). JSON body 스트림 읽기, URL 파싱 같은 Node 전용 배관만 여기서 한다 —
 * 실제 라우팅/인증/게임 로직은 전혀 담지 않는다. 나중에 Google Apps Script `doPost`로 포팅할
 * 때는 이 파일만 그 환경에 맞는 어댑터로 교체하면 된다(D-028).
 */
import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { handleApiRequest, type ApiRequest } from "./httpApi.js";

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      if (raw.length === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function toSingleHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(payload);
}

/** `/api` 하위 요청만 처리한다고 가정한다 — 마운트 지점 판단은 호출부(`viteApiPlugin.ts`)의 책임. */
export function createApiRequestListener(): RequestListener {
  return (req, res) => {
    void (async () => {
      let body: unknown;
      if (req.method === "POST") {
        try {
          body = await readJsonBody(req);
        } catch {
          sendJson(res, 400, { error: "invalid JSON body" });
          return;
        }
      }

      const url = new URL(req.url ?? "/", "http://localhost");
      const query: Record<string, string> = {};
      url.searchParams.forEach((value, key) => {
        query[key] = value;
      });
      const headers: Record<string, string | undefined> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        headers[key] = toSingleHeaderValue(value);
      }

      const apiRequest: ApiRequest = {
        method: req.method ?? "GET",
        path: url.pathname,
        query,
        headers,
        body,
      };

      try {
        const response = await handleApiRequest(apiRequest);
        sendJson(res, response.status, response.body);
      } catch (error) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : "internal error" });
      }
    })();
  };
}
