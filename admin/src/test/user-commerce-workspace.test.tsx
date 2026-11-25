import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserCommerceError, type UserCommerceClient } from "../features/user-commerce/user-commerce-client";
import { UserCommerceWorkspace } from "../features/user-commerce/user-commerce-workspace";

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{1,128}$/;
const CLAWBACK_RESULT = { clawbackRef: "claw-1", settlement: { ratePercent: 20, effectiveAt: "2026-09-08", availableRewardCoins: "60" } };

async function openClawbackConfirmation(commerce: UserCommerceClient) {
  render(<UserCommerceWorkspace client={commerce} />);
  fireEvent.click(screen.getByRole("tab", { name: "分享结算" }));
  fireEvent.click(screen.getByRole("button", { name: "查询" }));
  expect(await screen.findByText(/当前比例 20%/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("划扣 Coins"), { target: { value: "20" } });
  fireEvent.change(screen.getAllByLabelText("用户编号")[1], { target: { value: "acct_sample" } });
  fireEvent.change(screen.getByLabelText("原因"), { target: { value: "重复发放" } });
  fireEvent.click(screen.getByRole("button", { name: "准备划扣" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
}

function clawbackKey(call: unknown) {
  return (call as [{ idempotencyKey: string }])[0].idempotencyKey;
}

function client(): UserCommerceClient {
  return {
    readOrders: vi.fn(async () => [{ orderRef: "R-1001", accountId: "acct_sample", kind: "recharge" as const, status: "已入账", amountLabel: "20 CNY", createdAt: "2026-10-02T00:00:00Z" }]),
    readLedger: vi.fn(async () => [{ entryRef: "led-1", accountId: "acct_sample", occurredAt: "2026-10-02T00:00:00Z", direction: "credit" as const, title: "首充", coins: "200" }]),
    readShareUsers: vi.fn(async () => [{ accountId: "acct_invited", registeredAt: "2026-10-03T00:00:00Z", linkLabel: "样例链接", firstRecharge: true }]),
    readSettlement: vi.fn(async () => ({ ratePercent: 20, effectiveAt: "2026-09-08", availableRewardCoins: "80" })),
    updateRate: vi.fn(async () => ({ ratePercent: 15, effectiveAt: "2026-10-23", availableRewardCoins: "80" })),
    clawback: vi.fn(async () => ({ clawbackRef: "claw-1", settlement: { ratePercent: 20, effectiveAt: "2026-09-08", availableRewardCoins: "60" } }))
  };
}

describe("user commerce workspace", () => {
  afterEach(() => cleanup());

  it("queries orders, ledger rows, and share registrations", async () => {
    const commerce = client();
    render(<UserCommerceWorkspace client={commerce} />);
    fireEvent.change(screen.getByLabelText("用户编号"), { target: { value: "acct_sample" } });
    fireEvent.click(screen.getByRole("button", { name: "查询" }));
    expect(await screen.findByRole("cell", { name: "R-1001" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "流水" }));
    fireEvent.click(screen.getByRole("button", { name: "查询" }));
    expect(await screen.findByRole("cell", { name: "首充" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "分享用户" }));
    fireEvent.click(screen.getByRole("button", { name: "查询" }));
    expect(await screen.findByRole("cell", { name: "样例链接" })).toBeTruthy();
    expect(commerce.readShareUsers).toHaveBeenCalledWith({ accountId: "acct_sample", from: "2026-10-01", to: "2026-10-22" });
  });

  it("confirms a future settlement rate and a reward clawback before submitting", async () => {
    const commerce = client();
    render(<UserCommerceWorkspace client={commerce} />);
    fireEvent.click(screen.getByRole("tab", { name: "分享结算" }));
    fireEvent.click(screen.getByRole("button", { name: "查询" }));
    expect(await screen.findByText(/当前比例 20%/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("结算比例（%）"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "准备更新比例" }));
    fireEvent.click(screen.getByRole("button", { name: "确认提交" }));
    expect(await screen.findByText("结算比例已提交。它会从生效日期起用于之后的分享奖励。")).toBeTruthy();
    expect(commerce.updateRate).toHaveBeenCalledWith({ ratePercent: 15, effectiveAt: "2026-10-23" });
    fireEvent.change(screen.getByLabelText("划扣 Coins"), { target: { value: "20" } });
    fireEvent.change(screen.getAllByLabelText("用户编号")[1], { target: { value: "acct_sample" } });
    fireEvent.change(screen.getByLabelText("原因"), { target: { value: "重复发放" } });
    fireEvent.click(screen.getByRole("button", { name: "准备划扣" }));
    expect(commerce.clawback).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认提交" }));
    expect(await screen.findByText("奖励 Coins 划扣已提交。")).toBeTruthy();
  });

  it.each([
    ["failed", "暂时无法读取，请稍后再试。"],
    ["invalid", "查询条件或提交内容无效。"],
    ["conflict", "结算正在处理，请稍后再试。"],
    ["unavailable", "用户商业管理接口尚未启用。"]
  ] as const)("retries a clawback with the same idempotency key after a %s error", async (code, statusText) => {
    const clawback = vi.fn()
      .mockRejectedValueOnce(new UserCommerceError(code))
      .mockResolvedValue(CLAWBACK_RESULT);
    const commerce: UserCommerceClient = { ...client(), clawback };
    await openClawbackConfirmation(commerce);
    fireEvent.click(screen.getByRole("button", { name: "确认提交" }));
    expect(await screen.findByText(statusText)).toBeTruthy();
    // The failed submission keeps its confirmation — and its key — open,
    // so the retry replays the same clawback instead of minting a second one.
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认提交" }));
    expect(await screen.findByText("奖励 Coins 划扣已提交。")).toBeTruthy();
    expect(clawback).toHaveBeenCalledTimes(2);
    const keys = clawback.mock.calls.map(clawbackKey);
    expect(keys[0]).toMatch(IDEMPOTENCY_KEY);
    expect(keys[1]).toBe(keys[0]);
  });

  it("mints a new idempotency key for each new clawback confirmation", async () => {
    const clawback = vi.fn(async () => CLAWBACK_RESULT);
    const commerce: UserCommerceClient = { ...client(), clawback };
    await openClawbackConfirmation(commerce);
    fireEvent.click(screen.getByRole("button", { name: "确认提交" }));
    expect(await screen.findByText("奖励 Coins 划扣已提交。")).toBeTruthy();
    // Same account, coins, and reason, deliberately confirmed again: a
    // new confirmation is a distinct clawback, so it must carry a new key.
    fireEvent.click(screen.getByRole("button", { name: "准备划扣" }));
    fireEvent.click(screen.getByRole("button", { name: "确认提交" }));
    expect(await screen.findByText("奖励 Coins 划扣已提交。")).toBeTruthy();
    expect(clawback).toHaveBeenCalledTimes(2);
    const keys = clawback.mock.calls.map(clawbackKey);
    expect(keys[0]).toMatch(IDEMPOTENCY_KEY);
    expect(keys[1]).toMatch(IDEMPOTENCY_KEY);
    expect(keys[1]).not.toBe(keys[0]);
  });
});
