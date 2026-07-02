import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const adminRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(adminRoot, "..");

function localAdminDevToken(mode: string) {
  const rootEnv = loadEnv(mode, repoRoot, "");
  const adminEnv = loadEnv(mode, adminRoot, "");
  return String(
    rootEnv.ADMIN_DEV_CONSOLE_TOKEN
    || rootEnv.VITE_ADMIN_CONSOLE_TOKEN
    || adminEnv.ADMIN_DEV_CONSOLE_TOKEN
    || adminEnv.VITE_ADMIN_CONSOLE_TOKEN
    || ""
  ).trim();
}

function isAdminApiPath(url = "") {
  return /^\/api\/admin(?:\/|$)/.test(url);
}

export default defineConfig(({ mode }) => {
  const adminDevToken = localAdminDevToken(mode);

  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: false,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:3456",
          changeOrigin: false,
          configure(proxy) {
            proxy.on("proxyReq", (proxyReq, req) => {
              if (adminDevToken && isAdminApiPath(req.url)) {
                proxyReq.setHeader("authorization", `Bearer ${adminDevToken}`);
              }
            });
          }
        }
      }
    },
    preview: {
      host: "127.0.0.1",
      port: 4173
    },
    test: {
      environment: "jsdom"
    }
  };
});
