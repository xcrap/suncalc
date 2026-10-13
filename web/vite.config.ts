import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // MapLibre alone is about a megabyte; the map is the whole page.
  build: { chunkSizeWarningLimit: 1600 },
  server: {
    host: "127.0.0.1",
    port: 3042,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3041" },
  },
});
