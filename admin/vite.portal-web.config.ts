import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import portalConfig from "./vite.portal.config";

const adminDir = path.dirname(fileURLToPath(import.meta.url));

// Keep the desktop artifact on the same Portal policy/plugin configuration as
// the legacy build. Only the static entry, URL base, output directory, and
// preview port differ.
export default defineConfig(mergeConfig(portalConfig, {
  root: path.resolve(adminDir, "portal-web"),
  base: "/web/",
  build: {
    outDir: path.resolve(adminDir, "dist-portal-web"),
    emptyOutDir: true
  },
  preview: {
    host: "127.0.0.1",
    port: 4176
  }
}));
