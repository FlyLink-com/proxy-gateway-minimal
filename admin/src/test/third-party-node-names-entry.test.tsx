import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isThirdPartyNodeNamesPreviewEnabled, THIRD_PARTY_NAMES_PREVIEW_HASH } from "../app/third-party-node-names-preview";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("third-party names local entry boundary", () => {
  const input = { dev: true, prod: false, hostname: "127.0.0.1", hash: THIRD_PARTY_NAMES_PREVIEW_HASH };
  it("allows only explicit development + loopback + exact route", () => {
    expect(isThirdPartyNodeNamesPreviewEnabled(input)).toBe(true);
    for (const hostname of ["localhost", "[::1]", "::1"]) expect(isThirdPartyNodeNamesPreviewEnabled({ ...input, hostname })).toBe(true);
    expect(isThirdPartyNodeNamesPreviewEnabled({ ...input, dev: false })).toBe(false);
    expect(isThirdPartyNodeNamesPreviewEnabled({ ...input, prod: true })).toBe(false);
    for (const hostname of ["admin.example.test", "127.0.0.1.example.test", "0.0.0.0", ""]) expect(isThirdPartyNodeNamesPreviewEnabled({ ...input, hostname })).toBe(false);
    for (const hash of ["#/admin", "#/third-party-node-names-preview/extra", "#/third-party-node-names-preview?enabled=true", ""]) expect(isThirdPartyNodeNamesPreviewEnabled({ ...input, hash })).toBe(false);
  });

  it("local app preview never loads an Admin session or business data", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("PROD", false);
    const fetchMock = vi.fn(() => Promise.reject(new Error("network forbidden")));
    vi.stubGlobal("fetch", fetchMock);
    const storageRead = vi.spyOn(Storage.prototype, "getItem");
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    window.history.replaceState(null, "", `/${THIRD_PARTY_NAMES_PREVIEW_HASH}`);
    vi.resetModules();
    const { ThirdPartyNodeNamesLocalEntry } = await import("../pages/third-party-node-names-local-entry");
    render(<ThirdPartyNodeNamesLocalEntry />);
    await screen.findByRole("heading", { name: "第三方节点命名", level: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storageRead).not.toHaveBeenCalled();
    expect(storageWrite).not.toHaveBeenCalled();
  });

  it("production denies preview hash without loading any Admin or business data", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("PROD", true);
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", `/${THIRD_PARTY_NAMES_PREVIEW_HASH}`);
    vi.resetModules();
    const { ThirdPartyNodeNamesLocalEntry } = await import("../pages/third-party-node-names-local-entry");
    render(<ThirdPartyNodeNamesLocalEntry />);
    expect(screen.getByRole("heading", { name: "本地预览未启用" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "第三方节点命名" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
