import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createServer, type UserConfig } from "vite";
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
});
