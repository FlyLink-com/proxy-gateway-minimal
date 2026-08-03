import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { build, createServer, type UserConfig } from "vite";
import { describe, expect, test } from "vitest";
import productionPortalConfig from "../../vite.portal.config";
import localApiValidationConfig from "../../vite.portal.local-api-validation.config";

const productionConfig = productionPortalConfig as UserConfig;
const validationConfig = localApiValidationConfig as UserConfig;
const adminDir = resolve(".");

describe("Portal local API validation config", () => {
  test("merges only local dev resolution and a server into the real Portal production candidate", () => {
    expect(Object.hasOwn(productionConfig, "server")).toBe(false);
    expect(validationConfig).not.toBe(productionConfig);

    const productionKeys = Object.keys(productionConfig);
    const inheritedConfig = Object.fromEntries(
      productionKeys.map((key) => [
        key,
        validationConfig[key as keyof UserConfig]
      ])
    );
    expect(inheritedConfig).toEqual(productionConfig);
    expect(
      Object.keys(validationConfig).filter(
        (key) => !Object.hasOwn(productionConfig, key)
      )
    ).toEqual(["resolve", "server"]);

    expect(validationConfig.root).toBe(resolve(adminDir, "portal"));
    expect(validationConfig.publicDir).toBe(resolve(adminDir, "public"));
    expect(validationConfig.plugins).toEqual(productionConfig.plugins);
    expect(validationConfig.build).toEqual({
      outDir: resolve(adminDir, "dist-portal"),
      emptyOutDir: true
    });
    expect(validationConfig.build?.rollupOptions?.input).toBeUndefined();
  });

  test("uses one strict loopback listener and proxies only API requests", () => {
    expect(validationConfig.server).toEqual({
      host: "127.0.0.1",
      port: 5175,
      strictPort: true,
      hmr: false,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:3457"
        }
      }
    });
  });

  test("keeps the real HTML, bootstrap, stylesheet, and command chain", () => {
    const portalHtml = readFileSync(
      resolve(validationConfig.root as string, "index.html"),
      "utf8"
    );
    const parsedHtml = new DOMParser().parseFromString(portalHtml, "text/html");
    const bootstrapSrc = parsedHtml
      .querySelector('script[type="module"]')
      ?.getAttribute("src");
    expect(bootstrapSrc).toBe("../src/portal-main.tsx");

    const bootstrapPath = resolve(
      validationConfig.root as string,
      bootstrapSrc as string
    );
    expect(bootstrapPath).toBe(resolve(adminDir, "src/portal-main.tsx"));
    const bootstrapSource = readFileSync(bootstrapPath, "utf8");
    expect(bootstrapSource).toContain('import "./portal-static-preserve.css";');

    const stylesheetPath = resolve(
      dirname(bootstrapPath),
      "portal-static-preserve.css"
    );
    expect(stylesheetPath).toBe(
      resolve(adminDir, "src/portal-static-preserve.css")
    );
    expect(readFileSync(stylesheetPath, "utf8")).toContain(
      '@import "./styles/portal-static-preserve/user-portal-commerce.css";'
    );

    const packageJson = JSON.parse(
      readFileSync(resolve(adminDir, "package.json"), "utf8")
    ) as { scripts: Record<string, string> };
    const command = packageJson.scripts["dev:portal:local-api-validation"];
    expect(command).toBe(
      "vite --config vite.portal.local-api-validation.config.ts"
    );

    const validationConfigSource = readFileSync(
      resolve(adminDir, "vite.portal.local-api-validation.config.ts"),
      "utf8"
    );
    expect(`${validationConfigSource}\n${command}`).not.toMatch(
      /\b(?:preview|fixture|demo|mock)\b/i
    );
  });

  test("serves the real Portal bootstrap without Fast Refresh re-entry", async () => {
    const vite = await createServer({
      ...validationConfig,
      configFile: false,
      logLevel: "silent",
      server: {
        ...validationConfig.server,
        middlewareMode: true
      }
    });

    try {
      expect(vite.config.server.hmr).toBe(false);
      const transformed = await vite.transformRequest(
        "/src/portal-main.tsx"
      );
      expect(transformed?.code).toContain("PortalOnlyApp");
      expect(transformed?.code).not.toContain("__vite_react_currentExports");
    } finally {
      await vite.close();
    }
  });

  test("embeds only the reviewed recharge origin variable in the Portal bundle", async () => {
    const trustedOrigins = JSON.stringify({
      xsd_v1: [
        "https://z-cashier.example.invalid",
        "https://a-cashier.example.invalid",
      ],
      i_v1: ["https://lower.example.invalid"],
      I_v1: ["https://upper.example.invalid"],
    });
    const unrelatedSentinel = "portal_unrelated_vite_sentinel_must_not_ship";
    const previousTrustedOrigins = process.env.VITE_PORTAL_RECHARGE_TRUSTED_ACTION_ORIGINS_JSON;
    const previousSentinel = process.env.VITE_PORTAL_UNRELATED_SENTINEL;
    process.env.VITE_PORTAL_RECHARGE_TRUSTED_ACTION_ORIGINS_JSON = trustedOrigins;
    process.env.VITE_PORTAL_UNRELATED_SENTINEL = unrelatedSentinel;

    try {
      const result = await build({
        ...productionConfig,
        configFile: false,
        logLevel: "silent",
        build: {
          ...productionConfig.build,
          write: false,
        },
      });
      const outputs = Array.isArray(result) ? result : [result];
      const bundleText = outputs.flatMap((output) => (
        "output" in output ? output.output : []
      )).map((entry) => {
        if (entry.type === "chunk") return entry.code;
        return typeof entry.source === "string"
          ? entry.source
          : new TextDecoder().decode(entry.source);
      }).join("\n");
      const runtimeBundleText = outputs.flatMap((output) => (
        "output" in output ? output.output : []
      )).filter((entry) => entry.type === "chunk")
        .map((entry) => entry.code)
        .join("\n");

      expect(bundleText).toContain("a-cashier.example.invalid");
      expect(bundleText).not.toContain(unrelatedSentinel);

      const rechargeConfigAssets = outputs.flatMap((output) => (
        "output" in output ? output.output : []
      )).filter((entry) => entry.type === "asset"
        && entry.fileName === "portal-recharge-config.json");
      expect(rechargeConfigAssets).toHaveLength(1);
      const rechargeConfigSource = rechargeConfigAssets[0]?.type === "asset"
        ? rechargeConfigAssets[0].source
        : "";
      const rechargeConfig = JSON.parse(typeof rechargeConfigSource === "string"
        ? rechargeConfigSource
        : new TextDecoder().decode(rechargeConfigSource)) as {
          schemaVersion: string;
          sha256: string;
          trustedActionOriginsByAdapter: Record<string, string[]>;
        };
      const canonicalOriginConfig = {
        I_v1: ["https://upper.example.invalid"],
        i_v1: ["https://lower.example.invalid"],
        xsd_v1: [
          "https://a-cashier.example.invalid",
          "https://z-cashier.example.invalid",
        ],
      };
      const canonicalConfig = JSON.stringify(canonicalOriginConfig);
      const expectedConfigSha256 = createHash("sha256")
        .update(canonicalConfig)
        .digest("hex");
      expect(rechargeConfig).toEqual({
        schemaVersion: "1",
        sha256: expectedConfigSha256,
        trustedActionOriginsByAdapter: canonicalOriginConfig,
      });
      expect(Object.keys(rechargeConfig.trustedActionOriginsByAdapter))
        .toEqual(["I_v1", "i_v1", "xsd_v1"]);
      expect(runtimeBundleText).toContain(expectedConfigSha256);
    } finally {
      if (previousTrustedOrigins === undefined) {
        delete process.env.VITE_PORTAL_RECHARGE_TRUSTED_ACTION_ORIGINS_JSON;
      } else {
        process.env.VITE_PORTAL_RECHARGE_TRUSTED_ACTION_ORIGINS_JSON = previousTrustedOrigins;
      }
      if (previousSentinel === undefined) {
        delete process.env.VITE_PORTAL_UNRELATED_SENTINEL;
      } else {
        process.env.VITE_PORTAL_UNRELATED_SENTINEL = previousSentinel;
      }
    }
  });

  test.each([
    ["malformed JSON", "{invalid-json"],
    ["a PayPal trust-root override", '{"paypal_v1":["https://pay.example.invalid"]}'],
    ["an unsafe HTTP origin", '{"xsd_v1":["http://cashier.example.invalid"]}'],
  ])("rejects %s during Portal build", async (_case, invalidConfig) => {
    const previousTrustedOrigins = process.env.VITE_PORTAL_RECHARGE_TRUSTED_ACTION_ORIGINS_JSON;
    process.env.VITE_PORTAL_RECHARGE_TRUSTED_ACTION_ORIGINS_JSON = invalidConfig;
    try {
      await expect(build({
        ...productionConfig,
        configFile: false,
        logLevel: "silent",
        build: {
          ...productionConfig.build,
          write: false,
        },
      })).rejects.toThrow();
    } finally {
      if (previousTrustedOrigins === undefined) {
        delete process.env.VITE_PORTAL_RECHARGE_TRUSTED_ACTION_ORIGINS_JSON;
      } else {
        process.env.VITE_PORTAL_RECHARGE_TRUSTED_ACTION_ORIGINS_JSON = previousTrustedOrigins;
      }
    }
  });
});
