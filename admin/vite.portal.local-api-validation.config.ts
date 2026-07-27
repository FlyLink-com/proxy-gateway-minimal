import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import portalConfig from "./vite.portal.config";

const adminDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(
  mergeConfig(portalConfig, {
    resolve: {
      alias: {
        "/src": path.resolve(adminDir, "src")
      }
    },
    server: {
      host: "127.0.0.1",
      port: 5175,
      strictPort: true,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:3457"
        }
      }
    }
  })
);
