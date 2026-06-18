import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appVersion = readFileSync(resolve(__dirname, "../VERSION"), "utf-8").trim();

// Le proxy renvoie /api vers l'API Express en dev (évite les soucis de CORS).
export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3051",
        changeOrigin: true,
      },
    },
  },
});
