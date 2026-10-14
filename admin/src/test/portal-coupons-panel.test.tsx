import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PortalCouponsPanel } from "../features/user-portal/coupons/portal-coupons-panel";
import { PortalRedeemPanel } from "../features/user-portal/coupons/portal-redeem-panel";
import { createPortalCouponClient, parsePortalCouponList, PortalCouponClientError } from "../features/user-portal/coupons/coupon-client";
import { LOCAL_PREVIEW_COUPONS, createLocalPreviewCouponClient } from "../features/user-portal/user-portal-preview-data";

const HINT = "优惠券怎么用";

describe("我的优惠券 panel", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => cleanup());

  it("groups coupons into 可用 / 已使用 / 已过期 with no stacking, discount-note or remaining-uses copy", async () => {
    render(<PortalCouponsPanel locale="zh" couponClient={createLocalPreviewCouponClient()} sessionRef="session_alpha" accountKey="user_a" />);
    const panel = screen.getByRole("tabpanel");
    await waitFor(() => expect(within(panel).getByText("WK7M-Q4RT-9HZC")).toBeTruthy());
    expect(within(panel).getByText("立减 10%")).toBeTruthy();
    expect(within(panel).getByText("立减 20 Coins")).toBeTruthy();
    expect(within(panel).getAllByRole("button", { name: "复制券码" })).toHaveLength(3);
    fireEvent.click(screen.getByRole("tab", { name: /已使用/ }));
    const used = screen.getByRole("tabpanel");
    expect(within(used).getByText("ord_preview_0921")).toBeTruthy();
    expect(within(used).getByText("5 Coins")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /已过期/ }));
    expect(within(screen.getByRole("tabpanel")).getByText("S9TC-4VAH-E7GM")).toBeTruthy();
    expect(screen.queryByText(/叠加|剩余次数|折扣/)).toBeNull();
  });

  it("shows the explanation only until dismissed, per account", async () => {
    const { unmount } = render(<PortalCouponsPanel locale="zh" couponClient={createLocalPreviewCouponClient()} sessionRef="session_alpha" accountKey="user_a" />);
    expect(screen.getByRole("heading", { name: HINT })).toBeTruthy();
    expect(screen.getByText(/不支持退款/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "知道了" }));
    expect(screen.queryByRole("heading", { name: HINT })).toBeNull();
    unmount();
    render(<PortalCouponsPanel locale="zh" couponClient={createLocalPreviewCouponClient()} sessionRef="session_alpha" accountKey="user_a" />);
    expect(screen.queryByRole("heading", { name: HINT })).toBeNull();
    expect(screen.queryByText(/不支持退款/)).toBeNull();
    cleanup();
    render(<PortalRedeemPanel locale="zh" couponClient={createLocalPreviewCouponClient()} sessionRef="session_alpha" accountKey="user_b" />);
    expect(screen.getByRole("heading", { name: HINT })).toBeTruthy();
  });

  it("copies codes and invalidates the session on 401", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<PortalCouponsPanel locale="zh" couponClient={createLocalPreviewCouponClient()} sessionRef="session_alpha" />);
    fireEvent.click((await screen.findAllByRole("button", { name: "复制券码" }))[0]);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("WK7M-Q4RT-9HZC"));
    cleanup();
    const onSessionInvalid = vi.fn();
    const client = { listCoupons: vi.fn().mockRejectedValue(new PortalCouponClientError("invalid_session")), redeemCoupon: vi.fn() };
    render(<PortalCouponsPanel locale="zh" couponClient={client} sessionRef="session_alpha" onSessionInvalid={onSessionInvalid} />);
    await waitFor(() => expect(onSessionInvalid).toHaveBeenCalled());
  });
});

describe("兑换码兑换 panel", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => cleanup());

  it("formats input, redeems once, then shows the generic error on reuse", async () => {
    const onOpenCoupons = vi.fn();
    render(<PortalRedeemPanel locale="zh" couponClient={createLocalPreviewCouponClient()} sessionRef="session_alpha" onOpenCoupons={onOpenCoupons} />);
    const input = screen.getByLabelText("兑换码") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "prev iew2 code" } });
    expect(input.value).toBe("PREV-IEW2-CODE");
    fireEvent.click(screen.getByRole("button", { name: "兑换" }));
    expect(await screen.findByText(/兑换成功/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "查看我的优惠券" }));
    expect(onOpenCoupons).toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "PREV-IEW2-CODE" } });
    fireEvent.click(screen.getByRole("button", { name: "兑换" }));
    expect((await screen.findByRole("alert")).textContent).toBe("兑换码无效或已被使用。");
  });

  it("shows the rate-limit message", async () => {
    const client = { listCoupons: vi.fn(), redeemCoupon: vi.fn().mockRejectedValue(new PortalCouponClientError("redeem_rate_limited")) };
    render(<PortalRedeemPanel locale="zh" couponClient={client} sessionRef="session_alpha" />);
    fireEvent.change(screen.getByLabelText("兑换码"), { target: { value: "ABCDEFGHJKMN" } });
    fireEvent.click(screen.getByRole("button", { name: "兑换" }));
    expect((await screen.findByRole("alert")).textContent).toBe("尝试次数过多，请稍后再试。");
  });
});

describe("coupon client", () => {
  it("parses the server shape and rejects malformed data", () => {
    expect(parsePortalCouponList(structuredClone(LOCAL_PREVIEW_COUPONS)).items).toHaveLength(5);
    const first = LOCAL_PREVIEW_COUPONS.items[0];
    expect(() => parsePortalCouponList({ asOf: LOCAL_PREVIEW_COUPONS.asOf, items: [{ ...first, status: "bogus" }] })).toThrow();
    expect(() => parsePortalCouponList({ asOf: LOCAL_PREVIEW_COUPONS.asOf, items: [{ ...first, value: 2500 }] })).toThrow();
  });

  it("lists and redeems via the owner-only routes and maps errors", async () => {
    const coupon = LOCAL_PREVIEW_COUPONS.items[0];
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(LOCAL_PREVIEW_COUPONS), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ coupon }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "redeem_failed" }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "redeem_rate_limited" }), { status: 429 }));
    const client = createPortalCouponClient({ fetchFn });
    expect((await client.listCoupons({ sessionRef: "session_alpha" })).items[0].code).toBe(coupon.code);
    expect((await client.redeemCoupon({ sessionRef: "session_alpha", code: "wk7m q4rt 9hzc" })).code).toBe(coupon.code);
    const [url, init] = fetchFn.mock.calls[1];
    expect(String(url)).toBe("/api/portal/residential-relay-packs/coupons/redeem");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ code: "wk7m q4rt 9hzc" });
    await expect(client.redeemCoupon({ sessionRef: "session_alpha", code: "x" })).rejects.toMatchObject({ code: "redeem_failed" });
    await expect(client.redeemCoupon({ sessionRef: "session_alpha", code: "x" })).rejects.toMatchObject({ code: "redeem_rate_limited" });
  });
});
