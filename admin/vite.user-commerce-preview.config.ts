import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Loopback sample only. It does not load .env or proxy to the admin backend.
export default defineConfig({
  envDir: false,
  plugins: [react()],
  server: { host: "127.0.0.1", port: 4197, strictPort: true }
});
