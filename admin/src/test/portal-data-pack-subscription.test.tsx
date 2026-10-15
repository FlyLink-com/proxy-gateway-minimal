import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";

import { PortalDataPackSubscription } from "../features/user-portal/commerce/components/portal-data-pack-subscription";
import type { PortalCoinCommerceClient } from "../features/user-portal/commerce";
import { DataPackRotationProvider } from "../features/user-portal/commerce/data-pack-rotation-context";

const delivery = {
  orderRef: "order_data_100gb_1",
  subscriptionUrl: "https://subscriptions.example.test/s/test-secret-not-for-log",
  usage: {
    totalBytes: 1_000, usedBytes: 250, remainingBytes: 750,
    collectionStatus: "measured" as const,
    updatedAt: "2026-09-28T00:00:00.000Z", exhausted: false
  }
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Portal data-pack order delivery", () => {
  test("checkout can auto-load once without rotating and ignores a late result after closing", async () => {
    let resolveRequest!: (value: typeof delivery) => void;
    const getDataPackDelivery = vi.fn(() => new Promise<typeof delivery>((resolve) => {
      resolveRequest = resolve;
    }));
    const rotateDataPackDelivery = vi.fn();
    const client = { getDataPackDelivery, rotateDataPackDelivery } as unknown as PortalCoinCommerceClient;
    const props = { commerceClient: client, sessionRef: "session_alpha", sessionGeneration: 1,
      orderRef: delivery.orderRef, locale: "zh" as const, onSessionInvalid: vi.fn(), autoLoad: true };
    const view = render(<PortalDataPackSubscription {...props} />);
    await waitFor(() => expect(getDataPackDelivery).toHaveBeenCalledTimes(1));
    view.rerender(<PortalDataPackSubscription {...props} />);
    expect(getDataPackDelivery).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => { resolveRequest(delivery); });
    expect(screen.queryByRole("button", { name: "复制订阅" })).toBeNull();
    expect(rotateDataPackDelivery).not.toHaveBeenCalled();
  });

  test("auto-load fences the old account response when the session changes", async () => {
    let resolveOld!: (value: typeof delivery) => void;
    const getDataPackDelivery = vi.fn()
      .mockImplementationOnce(() => new Promise<typeof delivery>((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce({ ...delivery, subscriptionUrl: "https://subscriptions.example.test/s/synthetic-beta" });
    const client = { getDataPackDelivery } as unknown as PortalCoinCommerceClient;
    const props = { commerceClient: client, sessionGeneration: 1, orderRef: delivery.orderRef,
      locale: "zh" as const, onSessionInvalid: vi.fn(), autoLoad: true };
    const view = render(<PortalDataPackSubscription {...props} sessionRef="session_alpha" />);
    view.rerender(<PortalDataPackSubscription {...props} sessionRef="session_beta" />);
    await screen.findByRole("textbox", { name: "订阅链接" });
    await act(async () => { resolveOld(delivery); });
    expect(screen.getByRole("textbox", { name: "订阅链接" })).toHaveValue("https://subscriptions.example.test/s/synthetic-beta");
    expect(getDataPackDelivery.mock.calls.map(([request]) => request.sessionRef))
      .toEqual(["session_alpha", "session_beta"]);
  });

  test("a session change fences an in-flight delivery and permits the new session", async () => {
    let resolveOld!: (value: typeof delivery) => void;
    const oldRequest = new Promise<typeof delivery>((resolve) => { resolveOld = resolve; });
    const getDataPackDelivery = vi.fn()
      .mockImplementationOnce(() => oldRequest)
      .mockResolvedValueOnce(delivery);
    const client = { getDataPackDelivery } as unknown as PortalCoinCommerceClient;
    const props = { commerceClient: client, sessionGeneration: 1,
      orderRef: delivery.orderRef, locale: "zh" as const, onSessionInvalid: vi.fn() };
    const view = render(<PortalDataPackSubscription {...props} sessionRef="session_alpha" />);
    expect(screen.queryByRole("textbox", { name: "订阅链接" })).toBeNull();
    view.rerender(<PortalDataPackSubscription {...props} sessionRef="session_beta" />);
    await act(async () => { resolveOld(delivery); });
    await screen.findByRole("button", { name: "复制订阅" });
    expect(getDataPackDelivery.mock.calls.map(([request]) => request.sessionRef))
      .toEqual(["session_alpha", "session_beta"]);
  });

  test("opening retrieves once and shows only a readonly link and compact copy/reset actions", async () => {
    const getDataPackDelivery = vi.fn().mockResolvedValue(delivery);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const client = { getDataPackDelivery } as unknown as PortalCoinCommerceClient;
    const props = {
      commerceClient: client, sessionRef: "session_alpha", sessionGeneration: 1,
      orderRef: delivery.orderRef, locale: "zh" as const, onSessionInvalid: vi.fn()
    };
    const view = render(<PortalDataPackSubscription {...props} />);
    const input = await screen.findByRole("textbox", { name: "订阅链接" });
    expect(input).toHaveValue(delivery.subscriptionUrl);
    expect(input).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: /获取订阅|查看订阅|刷新用量/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "复制订阅" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(delivery.subscriptionUrl));
    await screen.findByRole("dialog", { name: "订阅已复制" });
    expect(screen.getByText("你已复制订阅，请返回你的飞连 VPN／Clash 软件进行导入。")).toBeInTheDocument();
    expect(getDataPackDelivery).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(screen.queryByRole("textbox", { name: "订阅链接" })).toBeNull();
    expect(screen.queryByRole("button", { name: "复制订阅" })).toBeNull();
  });

  test("rotation uses one retryable reference, removes stale material, then refreshes", async () => {
    const getDataPackDelivery = vi.fn().mockResolvedValue(delivery);
    const rotateDataPackDelivery = vi.fn()
      .mockRejectedValueOnce(new Error("uncertain transport"))
      .mockResolvedValueOnce({ orderRef: delivery.orderRef, status: "complete" });
    vi.stubGlobal("crypto", { randomUUID: () => "12345678-1234-1234-1234-123456789abc" });
    const client = { getDataPackDelivery, rotateDataPackDelivery } as unknown as PortalCoinCommerceClient;
    render(<PortalDataPackSubscription commerceClient={client} sessionRef="session_alpha"
      sessionGeneration={1} orderRef={delivery.orderRef} locale="zh" onSessionInvalid={vi.fn()} />);
    await screen.findByRole("button", { name: "重置订阅" });
    fireEvent.click(screen.getByRole("button", { name: "重置订阅" }));
    expect(screen.getByRole("dialog", { name: "重置订阅" })).toBeInTheDocument();
    expect(screen.getByText("重置后，之前的订阅将立即失效，需要重新复制并导入。是否确认重置？")).toBeInTheDocument();
    expect(screen.getByText("已用流量不会清零")).toBeInTheDocument();
    expect(rotateDataPackDelivery).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认重置" }));
    await screen.findByRole("button", { name: "重试重置订阅" });
    expect(screen.queryByRole("button", { name: "复制订阅" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "订阅链接" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重试重置订阅" }));
    await screen.findByRole("button", { name: "复制订阅" });
    expect(rotateDataPackDelivery.mock.calls[0]?.[0]?.rotationRef)
      .toBe(rotateDataPackDelivery.mock.calls[1]?.[0]?.rotationRef);
    expect(getDataPackDelivery).toHaveBeenCalledTimes(2);
  });

  test("uncertain reset survives closing in the same portal scope without automatic GET or POST", async () => {
    const getDataPackDelivery = vi.fn().mockResolvedValue(delivery);
    const rotateDataPackDelivery = vi.fn().mockRejectedValueOnce(new Error("uncertain"))
      .mockResolvedValueOnce({ orderRef: delivery.orderRef, status: "complete" });
    const client = { getDataPackDelivery, rotateDataPackDelivery } as unknown as PortalCoinCommerceClient;
    const identity = { commerceClient: client, sessionRef: "session_alpha", sessionGeneration: 1 };
    const tree = (open: boolean, generation = 1) => <DataPackRotationProvider {...identity} sessionGeneration={generation}>
      {open ? <PortalDataPackSubscription {...identity} sessionGeneration={generation}
        orderRef={delivery.orderRef} locale="zh" onSessionInvalid={vi.fn()} /> : null}
    </DataPackRotationProvider>;
    const view = render(tree(true));
    fireEvent.click(await screen.findByRole("button", { name: "重置订阅" }));
    fireEvent.click(screen.getByRole("button", { name: "确认重置" }));
    await screen.findByRole("button", { name: "重试重置订阅" });
    view.rerender(tree(false));
    view.rerender(tree(true));
    const retry = await screen.findByRole("button", { name: "重试重置订阅" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(getDataPackDelivery).toHaveBeenCalledTimes(1);
    expect(rotateDataPackDelivery).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    await screen.findByRole("textbox", { name: "订阅链接" });
    expect(rotateDataPackDelivery.mock.calls[1][0].rotationRef).toBe(rotateDataPackDelivery.mock.calls[0][0].rotationRef);
    expect(getDataPackDelivery).toHaveBeenCalledTimes(2);
  });

  test("cancelling reset never posts and copy completion after account change cannot open feedback", async () => {
    let finishCopy!: () => void;
    const writeText = vi.fn(() => new Promise<void>((resolve) => { finishCopy = resolve; }));
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const rotateDataPackDelivery = vi.fn();
    const client = { getDataPackDelivery: vi.fn().mockResolvedValue(delivery), rotateDataPackDelivery } as unknown as PortalCoinCommerceClient;
    const props = { commerceClient: client, sessionGeneration: 1, orderRef: delivery.orderRef,
      locale: "zh" as const, onSessionInvalid: vi.fn() };
    const view = render(<PortalDataPackSubscription {...props} sessionRef="session_alpha" />);
    fireEvent.click(await screen.findByRole("button", { name: "重置订阅" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "重置订阅" })).getByRole("button", { name: "取消" }));
    expect(rotateDataPackDelivery).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "复制订阅" }));
    expect(screen.getByRole("button", { name: "重置订阅" })).toBeDisabled();
    view.rerender(<PortalDataPackSubscription {...props} sessionRef="session_beta" />);
    await screen.findByRole("textbox", { name: "订阅链接" });
    await act(async () => finishCopy());
    expect(screen.queryByRole("dialog", { name: "订阅已复制" })).toBeNull();
  });

  test("a pending reset cannot cross a new login generation", async () => {
    const getDataPackDelivery = vi.fn().mockResolvedValue(delivery);
    const rotateDataPackDelivery = vi.fn().mockRejectedValue(new Error("uncertain"));
    const client = { getDataPackDelivery, rotateDataPackDelivery } as unknown as PortalCoinCommerceClient;
    const tree = (generation: number) => <DataPackRotationProvider commerceClient={client}
      sessionRef="session_alpha" sessionGeneration={generation}>
      <PortalDataPackSubscription commerceClient={client} sessionRef="session_alpha" sessionGeneration={generation}
        orderRef={delivery.orderRef} locale="zh" onSessionInvalid={vi.fn()} />
    </DataPackRotationProvider>;
    const view = render(tree(1));
    fireEvent.click(await screen.findByRole("button", { name: "重置订阅" }));
    fireEvent.click(screen.getByRole("button", { name: "确认重置" }));
    await screen.findByRole("button", { name: "重试重置订阅" });
    view.rerender(tree(2));
    await screen.findByRole("textbox", { name: "订阅链接" });
    expect(screen.queryByRole("button", { name: "重试重置订阅" })).toBeNull();
    expect(rotateDataPackDelivery).toHaveBeenCalledTimes(1);
    expect(getDataPackDelivery).toHaveBeenCalledTimes(2);
  });

  test("failed automatic read exposes only retry and a failed copy keeps the readonly field", async () => {
    const getDataPackDelivery = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(delivery);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    const client = { getDataPackDelivery, rotateDataPackDelivery: vi.fn() } as unknown as PortalCoinCommerceClient;
    render(<PortalDataPackSubscription commerceClient={client} sessionRef="session_alpha" sessionGeneration={1}
      orderRef={delivery.orderRef} locale="zh" onSessionInvalid={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "重试读取订阅" }));
    fireEvent.click(await screen.findByRole("button", { name: "复制订阅" }));
    await screen.findByText("复制失败，请从链接框手动复制。");
    expect(screen.getByRole("textbox", { name: "订阅链接" })).toHaveValue(delivery.subscriptionUrl);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(client.rotateDataPackDelivery).not.toHaveBeenCalled();
  });
});
