/**
 * `src/appsScript/entry.ts`를 Apps Script에 붙여넣을 수 있는 단일 `.gs.js` 파일로 번들링한다
 * (Milestone 5 2부, D-032). Apps Script는 ES 모듈(`import`/`export`)이나 CommonJS
 * (`require`)를 지원하지 않으므로 `format: "iife"`로 번들링해 전역 스코프에서 즉시 실행되는
 * 하나의 파일을 만든다.
 *
 * **`src/server/httpApi.ts` alias 치환**: `httpApi.ts`는 소스 그대로 `./sessionRegistry.js`
 * (로컬 인메모리 세션 레지스트리, Node 전용 `node:crypto` 의존)를 import한다 — 이 저장소는
 * `src/server/*`를 한 글자도 바꾸지 않기로 했으므로(D-032), 번들링 시점에만 esbuild
 * `onResolve` 훅으로 이 import를 `src/appsScript/sessionRegistryAdapter.ts`(같은 이름/시그니처의
 * 시트 기반 구현)로 치환한다. `npm run typecheck`/vitest에는 이 alias가 전혀 적용되지 않아
 * `httpApi.ts`는 계속 진짜 `sessionRegistry.ts`를 참조한 채로 타입체크된다(의도된 동작).
 */
import { build, type Plugin } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { compileAppsScriptSync } from "./apps-script-sync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const entryPoint = path.join(projectRoot, "src/appsScript/entry.ts");
const sessionRegistryPath = path.join(projectRoot, "src/server/sessionRegistry.ts");
const sessionRegistryAdapterPath = path.join(projectRoot, "src/appsScript/sessionRegistryAdapter.ts");
const outfile = path.join(projectRoot, "dist/apps-script/Code.gs.js");

/**
 * `httpApi.ts`가 참조하는 `./sessionRegistry.js`(컴파일된 확장자 기준 상대경로)를
 * `sessionRegistryAdapter.ts`로 치환한다. `httpApi.ts` 자신의 소스는 전혀 바뀌지 않는다 —
 * esbuild가 모듈 그래프를 만드는 시점에 그 경로 하나의 resolve 결과만 가로챈다.
 */
const aliasSessionRegistryPlugin: Plugin = {
  name: "alias-session-registry-to-apps-script-adapter",
  setup(pluginBuild) {
    const syncFiles = new Set([
      "src/appsScript/entry.ts", "src/appsScript/dispatch.ts", "src/server/httpApi.ts",
      "src/multiplayer/GameSession.ts", "src/engine/RoundEngine.ts",
    ].map((file) => path.join(projectRoot, file)));
    pluginBuild.onLoad({ filter: /\.ts$/ }, async (args) => {
      if (!syncFiles.has(args.path)) return undefined;
      return { contents: compileAppsScriptSync(await readFile(args.path, "utf8"), args.path), loader: "js" };
    });
    pluginBuild.onResolve({ filter: /^\.\/sessionRegistry\.js$/ }, (args) => {
      if (path.resolve(args.resolveDir, args.path.replace(/\.js$/, ".ts")) !== sessionRegistryPath) {
        return undefined;
      }
      return { path: sessionRegistryAdapterPath };
    });
  },
};

/** `tests/appsScript/bundle.test.ts`가 서브프로세스 없이 직접 호출한다(크로스플랫폼 `npx`
 * 경로 문제를 피하기 위함). CLI에서 이 파일을 `tsx`로 직접 실행할 때도 이 함수가 쓰인다. */
export async function buildAppsScript(): Promise<{ outfile: string; errorCount: number }> {
  const result = await build({
    entryPoints: [entryPoint],
    outfile,
    bundle: true,
    format: "iife",
    target: "es2019",
    platform: "neutral",
    plugins: [aliasSessionRegistryPlugin],
    logLevel: "info",
  });

  return { outfile, errorCount: result.errors.length };
}

const isMainModule = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  buildAppsScript()
    .then(({ errorCount }) => {
      if (errorCount > 0) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
