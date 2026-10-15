import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { renderedNodeName, validateNodeName, type ThirdPartyNode } from "../features/third-party-node-names/node-name-model";
import { ThirdPartyNodeNamesPage } from "../features/third-party-node-names/third-party-node-names-page";

const node: ThirdPartyNode & { customCountryCode?: string | null } = {
  id: "synthetic-node-a", sourceName: "合成来源", originalName: "合成节点甲",
  defaultName: "[3P] OTHER 1 | 合成节点甲", customName: "🇺🇸 纽约入口",
  countryCode: "OTHER", protocol: "VLESS",
};
afterEach(cleanup);

describe("third-party country flag presentation", () => {
  test("detected country chip keeps a valid emoji font fallback list", () => {
    const css = readFileSync("src/features/third-party-node-names/third-party-admin-workspace.styles.css", "utf8");
    const chipRule = css.match(/\.tp-names-detected\s*\{([^}]+)\}/)?.[1];
    expect(chipRule).toBeDefined();
    const fonts = chipRule?.match(/font-family:\s*([^;]+);/)?.[1].split(",").map((font) => font.trim());
    expect(fonts).toEqual(['"Noto Color Emoji"', '"Apple Color Emoji"', '"Segoe UI Emoji"', "sans-serif"]);
  });
  test("untouched names and cleared overrides preserve original flags", () => {
    expect(renderedNodeName(node)).toBe("🇺🇸 纽约入口");
    expect(renderedNodeName({ ...node, customCountryCode: null } as typeof node)).toBe("🇺🇸 纽约入口");
  });
  test("explicit country replaces repeated leading flags without changing the alias", () => {
    const changed = { ...node, customName: "🇺🇸 🇸🇬 纽约入口", customCountryCode: "JP" };
    expect(renderedNodeName(changed)).toBe("🇯🇵 纽约入口");
    expect(changed.customName).toBe("🇺🇸 🇸🇬 纽约入口");
    expect(renderedNodeName({ ...changed, customCountryCode: "OTHER" })).toBe("纽约入口");
  });
  test("flags also apply to the default name and remain UTF-16 bounded", () => {
    expect(renderedNodeName({ ...node, customName: null, customCountryCode: "SG" })).toBe("🇸🇬 [3P] OTHER 1 | 合成节点甲");
    const name = renderedNodeName({ ...node, customName: "🌏".repeat(64), customCountryCode: "US" });
    expect(name.startsWith("🇺🇸 ")).toBe(true);
    expect(name.length).toBeLessThanOrEqual(128);
    expect(/[\ud800-\udfff]/u.test(name)).toBe(false);
  });
  test("normalizes truncated trailing whitespace before detecting flag-name collisions", () => {
    const a = { ...node, customName: "x".repeat(122) + " y", customCountryCode: "US" };
    const b = { ...node, id: "synthetic-node-b", customName: "x".repeat(122), customCountryCode: "US" };
    expect(renderedNodeName(a)).toBe(renderedNodeName(b));
    expect(validateNodeName([a, b], a.id, a.customName).error).toBeTruthy();
  });
  test("row country selection creates a draft, preserves hidden nodes and never auto-saves", () => {
    const onSave = vi.fn();
    const onEnable = vi.fn();
    render(<ThirdPartyNodeNamesPage initialNodes={[node, { ...node, id: "synthetic-node-b", originalName: "合成节点乙", customName: "保留节点" }]} persistence={{ enabled: false, busy: false, onSave, onEnable, importAction: null }} />);
    const country = screen.getByRole("combobox", { name: "国家/地区 合成节点甲" });
    expect(country).toHaveValue("");
    fireEvent.change(country, { target: { value: "JP" } });
    expect(screen.getByText("🇯🇵 纽约入口")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(onEnable).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "启用节点列表" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "搜索节点" }), { target: { value: "合成节点甲" } });
    fireEvent.click(screen.getByRole("button", { name: "保存节点列表" }));
    expect(onSave).toHaveBeenCalledWith([
      expect.objectContaining({ id: node.id, customName: node.customName, customCountryCode: "JP" }),
      expect.objectContaining({ id: "synthetic-node-b", customName: "保留节点" }),
    ]);
  });
  test.each(["enabled", "busy"] as const)("country selection stays locked while %s", (state) => {
    const onSave = vi.fn();
    render(<ThirdPartyNodeNamesPage initialNodes={[node]} persistence={{ enabled: false, busy: false, [state]: true, onSave, onEnable: vi.fn(), importAction: null }} />);
    const country = screen.getByRole("combobox", { name: "国家/地区 合成节点甲" });
    expect(country).toBeDisabled();
    fireEvent.change(country, { target: { value: "JP" } });
    expect(screen.getByText("🇺🇸 纽约入口")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
