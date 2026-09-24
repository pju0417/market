import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { apiPlugin } from "./src/server/viteApiPlugin.js";

export default defineConfig({
  // 상대 경로 base — GitHub Pages 프로젝트 주소(/저장소이름/)처럼 하위 경로에 올려도 자산이 깨지지 않는다.
  base: "./",
  plugins: [react(), apiPlugin()],
  resolve: {
    alias: {
      "@engine": "/src/engine",
      "@economy": "/src/economy",
      "@npc": "/src/npc",
      "@multiplayer": "/src/multiplayer",
      "@storage": "/src/storage",
      "@types": "/src/types",
      "@ui": "/src/ui",
    },
  },
});
