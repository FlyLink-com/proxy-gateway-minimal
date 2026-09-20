import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const desktopConfig = readFileSync(resolve("vite.portal-web.config.ts"), "utf8");
const desktopIndex = readFileSync(resolve("portal-web/index.html"), "utf8");
const mobileIndex = readFileSync(resolve("portal/index.html"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};

describe("portal desktop build boundary", () => {
  test("uses the shared Portal policy config with an isolated web base/output", () => {
    expect(desktopConfig).toContain('import portalConfig from "./vite.portal.config"');
    expect(desktopConfig).toContain("mergeConfig(portalConfig");
    expect(desktopConfig).toContain('root: path.resolve(adminDir, "portal-web")');
    expect(desktopConfig).toContain('base: "/web/"');
    expect(desktopConfig).toContain('path.resolve(adminDir, "dist-portal-web")');
    expect(packageJson.scripts?.["build:portal:web"]).toContain("vite build --config vite.portal-web.config.ts");
    expect(packageJson.scripts?.["verify:portal:web"]).toContain("dist-portal-web");
  });

  test("keeps desktop public URLs separate from the legacy mobile entry", () => {
    expect(desktopIndex).toContain('href="/web/favicon.svg"');
    expect(mobileIndex).toContain('href="/favicon.svg"');
    expect(desktopIndex).not.toContain('href="/favicon.svg"');
  });
});
