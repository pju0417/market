/**
 * `nodeAdapter.ts`가 만든 핸들러를 Vite dev/preview 서버의 `/api`에 마운트하는 플러그인
 * (Milestone 4 2단계). 이 파일만 `vite.config.ts`(UI 쪽 tsconfig 그래프)에서 import된다 —
 * `httpApi.ts`/`nodeAdapter.ts`/`tokenStore.ts`/`sessionRegistry.ts`는 이 파일을 거쳐서만
 * 간접적으로 그 그래프에 들어간다.
 *
 * `server.middlewares.use(path, handler)`(connect 스타일)를 쓰지 않고 직접 `req.url` 접두사를
 * 검사하는 이유: connect는 경로로 미들웨어를 마운트하면 그 미들웨어 안에서 `req.url`이 마운트
 * 경로만큼 잘려서 전달된다("/api/sessions" -> "/sessions") — `httpApi.ts`의 라우팅은 "/api"
 * 접두사가 그대로 붙어 있다고 가정하므로, 대신 이렇게 조건부로 다음 미들웨어에 위임한다.
 */
import type { Plugin } from "vite";
import { createApiRequestListener } from "./nodeAdapter.js";

export function apiPlugin(): Plugin {
  const listener = createApiRequestListener();

  const middleware = (
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
    next: (error?: unknown) => void,
  ): void => {
    if (!req.url || !req.url.startsWith("/api")) {
      next();
      return;
    }
    listener(req, res);
  };

  return {
    name: "economy-game-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
