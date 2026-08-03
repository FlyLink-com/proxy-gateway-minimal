import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { parsePortalRechargeTrustedActionOriginsJson } from "./src/features/user-portal/recharge/portal-recharge-client";

const adminDir = path.dirname(fileURLToPath(import.meta.url));

function codePointOrder(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function portalRechargeBuildConfig(): Plugin {
  let identity = {
    schemaVersion: "1",
    sha256: createHash("sha256").update("{}").digest("hex"),
    trustedActionOriginsByAdapter: {} as Record<string, string[]>,
  };
  return {
    name: "portal-recharge-build-config",
    config() {
      const configured = parsePortalRechargeTrustedActionOriginsJson(
        process.env.VITE_PORTAL_RECHARGE_TRUSTED_ACTION_ORIGINS_JSON,
      );
      const normalized = Object.fromEntries(
        Object.entries(configured ?? {})
          .sort(([left], [right]) => codePointOrder(left, right))
          .map(([adapterKey, origins]) => [
            adapterKey,
            [...origins].sort(codePointOrder),
          ]),
      );
      const canonical = JSON.stringify(normalized);
      identity = {
        schemaVersion: "1",
        sha256: createHash("sha256").update(canonical).digest("hex"),
        trustedActionOriginsByAdapter: normalized,
      };
      return {
        define: {
          "import.meta.env.VITE_PORTAL_RECHARGE_TRUSTED_ACTION_ORIGINS_JSON":
            JSON.stringify(canonical),
          "import.meta.env.VITE_PORTAL_RECHARGE_CONFIG_SHA256":
            JSON.stringify(identity.sha256),
        },
      };
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "portal-recharge-config.json",
        source: `${JSON.stringify(identity, null, 2)}\n`,
      });
    },
  };
}

export default defineConfig({
  root: path.resolve(adminDir, "portal"),
  publicDir: path.resolve(adminDir, "public"),
  plugins: [portalRechargeBuildConfig(), react()],
  build: {
    outDir: path.resolve(adminDir, "dist-portal"),
    emptyOutDir: true
  },
  preview: {
    host: "127.0.0.1",
    port: 4175
  }
});
