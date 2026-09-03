import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The port `packages/app` listens on by default (kernel/config/index.ts). In dev the SPA
// is served by Vite and everything the app owns is proxied to that process; in
// production `createApp`'s static fallback serves this build and no proxy exists.
const app = "http://127.0.0.1:4242";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    proxy: {
      // SSE responses must reach the browser unbuffered, so the proxy stays a stream.
      "/api": { target: app, changeOrigin: false },
      "/files": { target: app, changeOrigin: false },
    },
  },
});
