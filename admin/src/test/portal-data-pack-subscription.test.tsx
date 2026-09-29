import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";

import { PortalDataPackSubscription } from "../features/user-portal/commerce/components/portal-data-pack-subscription";
import type { PortalCoinCommerceClient } from "../features/user-portal/commerce";

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
    fireEvent.click(screen.getByRole("button", { name: "获取订阅" }));
    expect(screen.getByRole("button", { name: "获取订阅" })).toBeDisabled();
    view.rerender(<PortalDataPackSubscription {...props} sessionRef="session_beta" />);
    expect(screen.getByRole("button", { name: "获取订阅" })).toBeEnabled();
    await act(async () => { resolveOld(delivery); });
    expect(screen.queryByRole("button", { name: "复制订阅" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "获取订阅" }));
    await screen.findByRole("button", { name: "复制订阅" });
    expect(getDataPackDelivery.mock.calls.map(([request]) => request.sessionRef))
      .toEqual(["session_alpha", "session_beta"]);
  });

  test("retrieves only on demand, supports refresh and copy, and forgets material when closed", async () => {
    const getDataPackDelivery = vi.fn().mockResolvedValue(delivery);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const client = { getDataPackDelivery } as unknown as PortalCoinCommerceClient;
    const props = {
      commerceClient: client, sessionRef: "session_alpha", sessionGeneration: 1,
      orderRef: delivery.orderRef, locale: "zh" as const, onSessionInvalid: vi.fn()
    };
    const view = render(<PortalDataPackSubscription {...props} />);
    expect(getDataPackDelivery).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "获取订阅" }));
    await screen.findByText("已用 250 / 1,000 B");
    expect(screen.queryByText(delivery.subscriptionUrl)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "复制订阅" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(delivery.subscriptionUrl));
    fireEvent.click(screen.getByRole("button", { name: "刷新用量" }));
    await waitFor(() => expect(getDataPackDelivery).toHaveBeenCalledTimes(2));
    view.unmount();
    render(<PortalDataPackSubscription {...props} />);
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
    fireEvent.click(screen.getByRole("button", { name: "获取订阅" }));
    await screen.findByRole("button", { name: "重置订阅" });
    fireEvent.click(screen.getByRole("button", { name: "重置订阅" }));
    fireEvent.click(screen.getByRole("button", { name: "确认重置" }));
    await screen.findByRole("button", { name: "重试重置订阅" });
    expect(screen.queryByRole("button", { name: "复制订阅" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重试重置订阅" }));
    await screen.findByRole("button", { name: "复制订阅" });
    expect(rotateDataPackDelivery.mock.calls[0]?.[0]?.rotationRef)
      .toBe(rotateDataPackDelivery.mock.calls[1]?.[0]?.rotationRef);
    expect(getDataPackDelivery).toHaveBeenCalledTimes(2);
  });
});
