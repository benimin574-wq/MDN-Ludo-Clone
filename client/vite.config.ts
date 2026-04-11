import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/matchmake": {
        target: "http://127.0.0.1:2567",
        changeOrigin: true,
      },
      "^/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+(?:\\?.*)?$": {
        target: "ws://127.0.0.1:2567",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
});
