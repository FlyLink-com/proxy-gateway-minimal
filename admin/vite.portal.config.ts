import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const adminDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(adminDir, "portal"),
  publicDir: path.resolve(adminDir, "public"),
  plugins: [react()],
  build: {
    outDir: path.resolve(adminDir, "dist-portal"),
    emptyOutDir: true
  },
  preview: {
    host: "127.0.0.1",
    port: 4175
  }
});
