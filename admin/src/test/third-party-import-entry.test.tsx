import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThirdPartyImportEntry } from "../features/third-party-node-names/third-party-import-entry";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function openFile() {
  if (!screen.queryByRole("dialog")) fireEvent.click(screen.getByRole("button", { name: "导入" }));
  fireEvent.click(screen.getByRole("tab", { name: "文件导入" }));
  return screen.getByLabelText("选择 YAML 文件") as HTMLInputElement;
}

function openAddress() {
  if (!screen.queryByRole("dialog")) fireEvent.click(screen.getByRole("button", { name: "导入" }));
  fireEvent.click(screen.getByRole("tab", { name: "HTTPS YAML" }));
  return screen.getByLabelText("HTTPS YAML 地址") as HTMLInputElement;
}

describe("third-party import local entry", () => {
  it("starts with one import button and opens a named modal with the file tab selected", () => {
    render(<ThirdPartyImportEntry />);
    const opener = screen.getByRole("button", { name: "导入" });
    expect(opener).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    fireEvent.click(opener);
    expect(screen.getByRole("dialog", { name: "导入节点" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("tab", { name: "文件导入" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "HTTPS YAML" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByLabelText("选择 YAML 文件")).toBeTruthy();
  });

  it("supports the disabled opener contract", () => {
    render(<ThirdPartyImportEntry disabled />);
    const opener = screen.getByRole("button", { name: "导入" });
    expect(opener).toBeDisabled();
    fireEvent.click(opener);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Escape, clears local data and restores focus to its opener", () => {
    render(<ThirdPartyImportEntry />);
    fireEvent.change(openAddress(), { target: { value: "https://example.com/local-only" } });
    fireEvent.keyDown(screen.getByLabelText("HTTPS YAML 地址"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "导入" })).toHaveFocus();
    expect(openAddress().value).toBe("");
  });

  it("traps Tab and Shift+Tab within the modal", () => {
    render(<ThirdPartyImportEntry />);
    openFile();
    const first = screen.getByRole("button", { name: "关闭导入" });
    const last = screen.getByRole("button", { name: "检查文件" });
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("supports roving tabs with arrow and Home/End keys", () => {
    render(<ThirdPartyImportEntry />);
    openFile();
    const first = screen.getByRole("tab", { name: "文件导入" });
    const second = screen.getByRole("tab", { name: "HTTPS YAML" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute("aria-selected", "true");
    expect(first).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(second, { key: "Home" });
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(first, { key: "End" });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: "ArrowLeft" });
    expect(first).toHaveFocus();
  });

  it("requires a file and rejects non-YAML, empty and oversized files", () => {
    render(<ThirdPartyImportEntry />);
    const input = openFile();
    fireEvent.click(screen.getByRole("button", { name: "检查文件" }));
    expect(screen.getByRole("alert")).toHaveTextContent("请选择 YAML 文件");
    const cases = [
      [new File(["x"], "nodes.txt"), "请选择 .yaml 或 .yml 文件"],
      [new File([], "empty.yml"), "文件为空"],
      [new File(["x".repeat(65537)], "large.yaml"), "64 KiB"],
    ] as const;
    for (const [file, error] of cases) {
      fireEvent.change(input, { target: { files: [file] } });
      fireEvent.click(screen.getByRole("button", { name: "检查文件" }));
      expect(screen.getByRole("alert")).toHaveTextContent(error);
      expect(input).toHaveAttribute("aria-invalid", "true");
    }
  });

  it("accepts a 64 KiB .YAML file but does not read its content or claim import", () => {
    render(<ThirdPartyImportEntry />);
    const file = new File(["x".repeat(65536)], "nodes.YAML");
    const read = vi.fn();
    Object.defineProperty(file, "text", { value: read });
    const fileReader = vi.fn();
    vi.stubGlobal("FileReader", fileReader);
    fireEvent.change(openFile(), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "检查文件" }));
    expect(screen.getByRole("status")).toHaveTextContent("文件类型和大小检查通过");
    expect(screen.getByRole("status")).toHaveTextContent("未读取正文，正式导入尚未接通");
    expect(read).not.toHaveBeenCalled();
    expect(fileReader).not.toHaveBeenCalled();
  });

  it("does not echo a selected filename in validation messages", () => {
    render(<ThirdPartyImportEntry />);
    fireEvent.change(openFile(), { target: { files: [new File(["x"], "private-synthetic-filename.txt")] } });
    fireEvent.click(screen.getByRole("button", { name: "检查文件" }));
    expect(screen.getByRole("alert").textContent).not.toContain("private-synthetic-filename");
  });

  it.each([
    "", "http://example.com/config.yaml", "ftp://example.com/config.yaml", "not-a-url",
    "https://user:pass@example.com/sub", "https://example.com/sub#secret",
    "https://localhost/sub", "https://sub.localhost/sub", "https://host.internal/sub",
    "https://router.local/sub", "https://intranet/sub", "https://127.0.0.1/sub",
    "https://10.0.0.1/sub", "https://172.16.0.1/sub", "https://192.168.1.1/sub",
    "https://169.254.169.254/sub", "https://2130706433/sub", "https://[::1]/sub",
    "https://[fd00::1]/sub", "https://example.com/\u007fconfig", "https://example.com/#",
  ])("rejects an unsafe or invalid address without reflecting it: %s", (address) => {
    render(<ThirdPartyImportEntry />);
    const input = openAddress();
    fireEvent.change(input, { target: { value: address } });
    fireEvent.click(screen.getByRole("button", { name: "检查地址" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(input).toHaveAttribute("aria-invalid", "true");
    if (address) expect(screen.getByRole("alert").textContent).not.toContain(address);
  });

  it.each(["https://example.com/nodes.yaml", "https://example.com/sub?key=synthetic-value", "  https://example.com/nodes.yml  "])("permits public-domain HTTPS shapes without requiring a YAML extension: %s", (address) => {
    render(<ThirdPartyImportEntry />);
    fireEvent.change(openAddress(), { target: { value: address } });
    fireEvent.click(screen.getByRole("button", { name: "检查地址" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("地址格式检查通过");
    expect(screen.getByRole("status")).toHaveTextContent("未发起网络请求，正式导入尚未接通");
    expect(screen.getByRole("status").textContent).not.toContain(address.trim());
  });

  it("clears the address and feedback when switching modes or closing", () => {
    render(<ThirdPartyImportEntry />);
    fireEvent.change(openAddress(), { target: { value: "https://example.com/sub?key=synthetic-value" } });
    fireEvent.click(screen.getByRole("button", { name: "检查地址" }));
    openFile();
    expect(screen.queryByRole("status")).toBeNull();
    expect(openAddress().value).toBe("");
    fireEvent.change(screen.getByLabelText("HTTPS YAML 地址"), { target: { value: "https://example.com/sub" } });
    fireEvent.click(screen.getByRole("button", { name: "关闭导入" }));
    expect(screen.queryByRole("region")).toBeNull();
    expect(openAddress().value).toBe("");
  });

  it("clears the selected file and feedback when its mode is reopened", () => {
    render(<ThirdPartyImportEntry />);
    fireEvent.change(openFile(), { target: { files: [new File(["x"], "nodes.yml")] } });
    fireEvent.click(screen.getByRole("button", { name: "检查文件" }));
    fireEvent.click(screen.getByRole("button", { name: "关闭导入" }));
    openFile();
    fireEvent.click(screen.getByRole("button", { name: "检查文件" }));
    expect(screen.getByRole("alert")).toHaveTextContent("请选择 YAML 文件");
  });

  it("makes no network or persistence calls during both local checks", () => {
    const fetchMock = vi.fn();
    const xhr = vi.spyOn(XMLHttpRequest.prototype, "open");
    const storageRead = vi.spyOn(Storage.prototype, "getItem");
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetchMock);
    const socket = vi.fn();
    vi.stubGlobal("WebSocket", socket);
    render(<ThirdPartyImportEntry />);
    fireEvent.change(openFile(), { target: { files: [new File(["x"], "nodes.yml")] } });
    fireEvent.click(screen.getByRole("button", { name: "检查文件" }));
    fireEvent.change(openAddress(), { target: { value: "https://example.com/sub?key=synthetic-value" } });
    fireEvent.click(screen.getByRole("button", { name: "检查地址" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
    expect(socket).not.toHaveBeenCalled();
    expect(storageRead).not.toHaveBeenCalled();
    expect(storageWrite).not.toHaveBeenCalled();
  });
});
