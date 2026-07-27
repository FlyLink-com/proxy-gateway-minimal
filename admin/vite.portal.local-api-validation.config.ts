import { defineConfig, mergeConfig } from "vite";
import portalConfig from "./vite.portal.config";

export default defineConfig(
  mergeConfig(portalConfig, {
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
