import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PortalCouponsPanel } from "../features/user-portal/coupons/portal-coupons-panel";
import { createPortalCouponClient, parsePortalCouponList, PortalCouponClientError } from "../features/user-portal/coupons/coupon-client";
import { LOCAL_PREVIEW_COUPONS, createLocalPreviewCouponClient } from "../features/user-portal/user-portal-preview-data";

describe("我的优惠券 panel", () => {
  afterEach(() => cleanup());
  it("groups coupons into 可用 / 已使用 / 已过期 tabs with card details", async () => {
    render(<PortalCouponsPanel locale="zh" couponClient={createLocalPreviewCouponClient()} sessionRef="session_alpha" />);
    expect(screen.getByRole("heading", { name: "我的优惠券" })).toBeTruthy();
    const panel = screen.getByRole("tabpanel");
    await waitFor(() => expect(within(panel).getByText("WELCOME10")).toBeTruthy());
    expect(within(panel).getByText("立减 10%")).toBeTruthy();
    expect(within(panel).getByText("立减 20 Coins")).toBeTruthy();
    expect(within(panel).getByText("未开始")).toBeTruthy();
    expect(within(panel).getAllByRole("button", { name: "复制券码" })).toHaveLength(3);
    fireEvent.click(screen.getByRole("tab", { name: /已使用/ }));
    expect(within(screen.getByRole("tabpanel")).getByText("FIRST5")).toBeTruthy();
    expect(within(screen.getByRole("tabpanel")).queryByRole("button", { name: "复制券码" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /已过期/ }));
    expect(within(screen.getByRole("tabpanel")).getByText("SUMMER25")).toBeTruthy();
    expect(screen.getByText(/不支持退款/)).toBeTruthy();
    expect(screen.queryByText(/叠加|折扣/)).toBeNull();
  });

  it("shows the empty state and copies codes", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const client = { listCoupons: vi.fn().mockResolvedValue({ asOf: LOCAL_PREVIEW_COUPONS.asOf, items: [LOCAL_PREVIEW_COUPONS.items[0]] }) };
    render(<PortalCouponsPanel locale="zh" couponClient={client} sessionRef="session_alpha" />);
    fireEvent.click(await screen.findByRole("button", { name: "复制券码" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("WELCOME10"));
    expect(await screen.findByRole("button", { name: "已复制" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /已过期/ }));
    expect(screen.getByText("没有已过期的优惠券。")).toBeTruthy();
  });

  it("invalidates the session on 401", async () => {
    const onSessionInvalid = vi.fn();
    const client = { listCoupons: vi.fn().mockRejectedValue(new PortalCouponClientError("invalid_session")) };
    render(<PortalCouponsPanel locale="zh" couponClient={client} sessionRef="session_alpha" onSessionInvalid={onSessionInvalid} />);
    await waitFor(() => expect(onSessionInvalid).toHaveBeenCalled());
  });
});

describe("coupon client", () => {
  it("parses the server shape and rejects malformed data", () => {
    expect(parsePortalCouponList(structuredClone(LOCAL_PREVIEW_COUPONS)).items).toHaveLength(5);
    expect(() => parsePortalCouponList({ asOf: LOCAL_PREVIEW_COUPONS.asOf, items: [{ ...LOCAL_PREVIEW_COUPONS.items[0], status: "bogus" }] })).toThrow();
    expect(() => parsePortalCouponList({ asOf: LOCAL_PREVIEW_COUPONS.asOf, items: [{ ...LOCAL_PREVIEW_COUPONS.items[0], code: "bad code" }] })).toThrow();
  });

  it("calls the owner-only route with the session header and maps 401", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(LOCAL_PREVIEW_COUPONS), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "invalid_session" }), { status: 401 }));
    const client = createPortalCouponClient({ fetchFn });
    const list = await client.listCoupons({ sessionRef: "session_alpha" });
    expect(list.items[0].code).toBe("WELCOME10");
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toBe("/api/portal/residential-relay-packs/coupons");
    expect(new Headers(init.headers).get("X-Portal-Session")).toBe("session_alpha");
    await expect(client.listCoupons({ sessionRef: "session_alpha" })).rejects.toMatchObject({ code: "invalid_session" });
  });
});
