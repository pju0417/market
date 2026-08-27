import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
