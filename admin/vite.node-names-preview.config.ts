import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Frontend-only preview: no .env loading, backend proxy, or public listener.
export default defineConfig({
  envDir: false,
  cacheDir: "node_modules/.vite-node-names-preview",
  plugins: [react(), {
    name: "node-names-preview-no-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (/^\/api(?:\/|\?|$)/i.test(req.url ?? "")) {
          res.statusCode = 503;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify({ error: "local_preview_no_backend" }));
          return;
        }
        next();
      });
    }
  }],
  server: { host: "127.0.0.1", port: 4193, strictPort: true }
});
