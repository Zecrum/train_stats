import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Le proxy renvoie /api vers l'API Express en dev (évite les soucis de CORS).
export default defineConfig({
  plugins: [vue()],
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
