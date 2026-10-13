import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThirdPartyAdminImport } from "../features/third-party-node-names/third-party-admin-import";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function fill(fileName = "synthetic.yaml", text = "proxies: []") {
  fireEvent.click(screen.getByRole("button", { name: "导入" }));
  fireEvent.change(screen.getByLabelText("来源名称"), { target: { value: "合成来源" } });
  const file = new File([text], fileName);
  const read = vi.fn().mockResolvedValue(text);
  Object.defineProperty(file, "text", { value: read });
  fireEvent.change(screen.getByLabelText("YAML 文件"), { target: { files: [file] } });
  fireEvent.click(screen.getByLabelText("基础月卡"));
  return { read, file };
}
const submit = () => fireEvent.click(screen.getByRole("button", { name: "导入并保持停用" }));

describe("formal Admin file import", () => {
  it("submits selected tiers and file content once, closes on confirmed success", async () => {
    const onImport = vi.fn().mockResolvedValue(true);
    render(<ThirdPartyAdminImport disabled={false} onImport={onImport} />);
    const { read } = fill();
    submit();
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    expect(onImport).toHaveBeenCalledWith({ name: "合成来源", yamlContent: "proxies: []", tiers: ["monthly_basic"] });
    expect(read).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("does not offer an enabled HTTPS fetch or URL input", () => {
    render(<ThirdPartyAdminImport disabled={false} onImport={vi.fn()} />);
    fill();
    expect(screen.getByText(/HTTPS YAML：暂未开放/)).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /地址/ })).toBeNull();
  });
  it.each(["input.txt", "empty.yaml", "oversize.yaml"])("rejects invalid file %s before reading", async (name) => {
    const onImport = vi.fn();
    render(<ThirdPartyAdminImport disabled={false} onImport={onImport} />);
    const { read } = fill(name, name === "empty.yaml" ? "" : name === "oversize.yaml" ? "a".repeat(65537) : "proxies: []");
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent("64 KiB");
    expect(read).not.toHaveBeenCalled(); expect(onImport).not.toHaveBeenCalled();
  });
  it("requires an explicit tier and source name", () => {
    render(<ThirdPartyAdminImport disabled={false} onImport={vi.fn()} />); fill();
    fireEvent.change(screen.getByLabelText("来源名称"), { target: { value: " " } }); submit();
    expect(screen.getByRole("alert")).toHaveTextContent("来源名称");
    fireEvent.change(screen.getByLabelText("来源名称"), { target: { value: "合成来源" } });
    fireEvent.click(screen.getByLabelText("基础月卡")); submit();
    expect(screen.getByRole("alert")).toHaveTextContent("至少一个");
  });
  it("rechecks decoded UTF-8 size", async () => {
    const onImport = vi.fn(); render(<ThirdPartyAdminImport disabled={false} onImport={onImport} />);
    const { read } = fill(); read.mockResolvedValue("中".repeat(22000)); submit();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("超过 64 KiB"));
    expect(onImport).not.toHaveBeenCalled();
  });
  it("blocks duplicate submit and close during a pending write", async () => {
    let complete!: (value: boolean) => void;
    const onImport = vi.fn(() => new Promise<boolean>((resolve) => { complete = resolve; }));
    render(<ThirdPartyAdminImport disabled={false} onImport={onImport} />); fill(); submit();
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "正在导入…" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    await act(async () => { complete(false); });
    expect(screen.getByRole("alert")).toHaveTextContent("勿重复导入");
    expect(onImport).toHaveBeenCalledOnce();
  });
  it("does not send a write after unmount while file reading is pending", async () => {
    const onImport = vi.fn(); const view = render(<ThirdPartyAdminImport disabled={false} onImport={onImport} />);
    const { read } = fill(); let complete!: (value: string) => void;
    read.mockImplementation(() => new Promise<string>((resolve) => { complete = resolve; }));
    submit(); view.unmount();
    await act(async () => { complete("proxies: []"); });
    expect(onImport).not.toHaveBeenCalled();
  });
  it("clears sensitive file selection on close and reopen, rejects disabled opener", () => {
    const view = render(<ThirdPartyAdminImport disabled={false} onImport={vi.fn()} />); fill();
    fireEvent.click(screen.getByRole("button", { name: "关闭导入" }));
    fireEvent.click(screen.getByRole("button", { name: "导入" }));
    expect(screen.getByLabelText("来源名称")).toHaveValue("");
    expect(screen.getByLabelText("基础月卡")).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "关闭导入" }));
    view.rerender(<ThirdPartyAdminImport disabled onImport={vi.fn()} />);
    expect(screen.getByRole("button", { name: "导入" })).toBeDisabled();
  });
  it("does not reflect errors or file contents", async () => {
    render(<ThirdPartyAdminImport disabled={false} onImport={vi.fn().mockRejectedValue(new Error("synthetic-private-error"))} />);
    fill(); submit();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("无法完成"));
    expect(document.body.textContent).not.toContain("synthetic-private-error");
    expect(document.body.textContent).not.toContain("proxies: []");
  });
});
