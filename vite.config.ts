import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { apiPlugin } from "./src/server/viteApiPlugin.js";

export default defineConfig({
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
