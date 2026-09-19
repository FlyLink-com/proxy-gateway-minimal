import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, test, vi } from "vitest";
import { ReferralRewardsPanel } from "../features/user-portal/portal-commerce-panels";
import { copyText } from "../shared/public/clipboard";
import { PortalReferralClientError } from "../features/user-portal/referrals/referral-client";

vi.mock("../shared/public/clipboard", () => ({ copyText: vi.fn(async () => true) }));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,cXJjb2Rl") } }));
const policy = { policyRef: "policy_test", version: 1, effectiveAt: "2026-09-01T00:00:00.000Z", rateBps: 1000, rounding: "floor" as const, attributionDays: 30, confirmationDays: 7 };
const profile = { eligible: true, linkPath: null as string | null, policy, attributionDays: 30 };
const performance = { registrations: 8, firstRechargeConversions: 2, creditedFirstRechargeCoins: 100, pendingRewardCoins: 7, availableRewardCoins: 3, reversedRewardCoins: 1, conversionRate: 0.25, reconciliationRequired: false };
const linkPath = `/r/${"a".repeat(32)}`;
function client() {
  return {
    getProfile: vi.fn(async () => profile),
    getPerformance: vi.fn(async () => performance),
    createLink: vi.fn(async () => ({ ...profile, linkPath })),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

test("loads actual referral metrics and creates one reusable link only after a click", async () => {
  const api = client();
  render(<ReferralRewardsPanel locale="zh" referralClient={api} sessionRef="session_test" />);
  expect(screen.getByRole("status")).toHaveTextContent("正在加载推荐奖励");
  expect(await screen.findByText("8")).toBeInTheDocument();
  expect(screen.getByText("首次充值人数")).toBeInTheDocument();
  expect(screen.queryByText("归因消费")).not.toBeInTheDocument();
  expect(api.createLink).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "生成推荐链接" }));
  expect(await screen.findByRole("textbox", { name: "我的推荐链接" })).toHaveValue(`${window.location.origin}${linkPath}`);
  fireEvent.click(screen.getByRole("button", { name: "复制链接" }));
  expect(await screen.findByText("链接已复制")).toBeInTheDocument();
  expect(copyText).toHaveBeenCalledWith(`${window.location.origin}${linkPath}`);
  fireEvent.click(screen.getByRole("button", { name: "显示二维码" }));
  expect(await screen.findByRole("img", { name: "推荐链接二维码" })).toBeInTheDocument();
  expect(api.createLink).toHaveBeenCalledTimes(1);
});

test("unavailable source does not fabricate zero metrics or expose backend error text", async () => {
  const api = client();
  api.getProfile.mockRejectedValue(new Error("secret_internal_database_row"));
  render(<ReferralRewardsPanel locale="zh" referralClient={api} sessionRef="session_test" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("推荐奖励暂时无法加载");
  expect(screen.queryByText("secret_internal_database_row")).not.toBeInTheDocument();
  expect(screen.queryByText("8")).not.toBeInTheDocument();
  api.getProfile.mockResolvedValue(profile);
  fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
  expect(await screen.findByText("8")).toBeInTheDocument();
});

test("missing attribution window keeps creation disabled without inventing a window or rewards", async () => {
  const api = { ...client(), getProfile: vi.fn(async () => ({ ...profile, policy: null, attributionDays: null })) };
  render(<ReferralRewardsPanel locale="zh" referralClient={api} sessionRef="session_test" />);
  expect(await screen.findByText("推荐链接暂未开放。")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "生成推荐链接" })).toBeDisabled();
  expect(screen.queryByText(/10%/)).not.toBeInTheDocument();
  expect(screen.queryByText(/30 天/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Coins/)).not.toBeInTheDocument();
});

test.each(["zh", "en"] as const)("distribution-only %s renders genuine registrations and permits create/copy/QR without reward promises", async locale => {
  const distribution = { ...profile, policy: null, attributionDays: 14 };
  const api = {
    getProfile: vi.fn(async () => distribution),
    getPerformance: vi.fn(async () => ({ ...performance, reconciliationRequired: true })),
    createLink: vi.fn(async () => ({ ...distribution, linkPath })),
  };
  const zh = locale === "zh";
  render(<ReferralRewardsPanel locale={locale} referralClient={api} sessionRef="session_test" onOpenWallet={vi.fn()} />);
  expect(await screen.findByText("8")).toBeInTheDocument();
  expect(screen.getByText(zh ? "分享专属链接，邀请好友注册。" : "Share your personal link and invite friends to register.")).toBeInTheDocument();
  expect(screen.getByText(zh ? "奖励活动暂未开放。" : "The reward program is not open yet.")).toBeInTheDocument();
  expect(screen.getByText(zh ? "好友需在访问链接后 14 天内注册。" : "Friends must register within 14 days of visiting the link.")).toBeInTheDocument();
  expect(document.querySelectorAll("dd")).toHaveLength(1);
  expect(screen.queryByText(zh ? "首次充值人数" : "First recharges")).not.toBeInTheDocument();
  expect(screen.queryByText(/Coins|10%|25%/)).not.toBeInTheDocument();
  expect(screen.queryByText(zh ? "部分奖励正在核对，确认后将更新。" : "Some rewards are being reviewed and will update after confirmation.")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: zh ? "查看钱包明细" : "View Wallet activity" })).not.toBeInTheDocument();
  const generate = screen.getByRole("button", { name: zh ? "生成推荐链接" : "Create referral link" });
  expect(generate).toBeEnabled(); fireEvent.click(generate);
  expect(await screen.findByRole("textbox", { name: zh ? "我的推荐链接" : "My referral link" })).toHaveValue(`${window.location.origin}${linkPath}`);
  fireEvent.click(screen.getByRole("button", { name: zh ? "复制链接" : "Copy link" }));
  expect(await screen.findByText(zh ? "链接已复制" : "Link copied")).toBeInTheDocument();
  expect(copyText).toHaveBeenCalledWith(`${window.location.origin}${linkPath}`);
  fireEvent.click(screen.getByRole("button", { name: zh ? "显示二维码" : "Show QR code" }));
  expect(await screen.findByRole("img", { name: zh ? "推荐链接二维码" : "Referral link QR code" })).toBeInTheDocument();
  expect(api.createLink).toHaveBeenCalledTimes(1);
});

test("double clicks while creating never submit another mutation", async () => {
  const api = client();
  const pending = deferred<{ eligible: boolean; linkPath: string; policy: typeof policy; attributionDays: number }>();
  api.createLink.mockReturnValue(pending.promise);
  render(<ReferralRewardsPanel locale="zh" referralClient={api} sessionRef="session_test" />);
  const button = await screen.findByRole("button", { name: "生成推荐链接" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button); fireEvent.click(button);
  expect(api.createLink).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve({ ...profile, linkPath }));
});

test("changing cookie-session generation immediately removes the previous link and ignores late results", async () => {
  const api = client();
  const pending = deferred<typeof performance>();
  api.getProfile.mockResolvedValue({ ...profile, linkPath });
  const view = render(<ReferralRewardsPanel locale="zh" referralClient={api} sessionRef="portal_browser_session" sessionGeneration={1} />);
  await screen.findByRole("textbox", { name: "我的推荐链接" });
  api.getPerformance.mockReturnValue(pending.promise);
  view.rerender(<ReferralRewardsPanel locale="zh" referralClient={api} sessionRef="portal_browser_session" sessionGeneration={2} />);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  view.unmount();
  await act(async () => pending.resolve(performance));
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

test("copy failure gives a manual copy alternative without creating another link", async () => {
  vi.mocked(copyText).mockRejectedValueOnce(new Error("clipboard denied"));
  const api = client();
  api.getProfile.mockResolvedValue({ ...profile, linkPath });
  render(<ReferralRewardsPanel locale="en" referralClient={api} sessionRef="session_test" />);
  fireEvent.click(await screen.findByRole("button", { name: "Copy link" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Copy failed. Select the link and copy it manually.");
  expect(api.createLink).not.toHaveBeenCalled();
});

test("an older refresh cannot overwrite a successfully generated link", async () => {
  const api = client();
  const oldProfile = deferred<typeof profile>();
  render(<ReferralRewardsPanel locale="zh" referralClient={api} sessionRef="session_test" />);
  await screen.findByText("8");
  api.getProfile.mockReturnValueOnce(oldProfile.promise);
  const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 6000);
  fireEvent.focus(window);
  await waitFor(() => expect(api.getProfile).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: "生成推荐链接" }));
  await screen.findByRole("textbox", { name: "我的推荐链接" });
  await act(async () => oldProfile.resolve(profile));
  expect(screen.getByRole("textbox", { name: "我的推荐链接" })).toHaveValue(`${window.location.origin}${linkPath}`);
  now.mockRestore();
});

test("expired sessions clear referral data and notify the owning shell", async () => {
  const api = client();
  api.getProfile.mockRejectedValueOnce(new PortalReferralClientError("invalid_session", false));
  const onSessionInvalid = vi.fn();
  render(<ReferralRewardsPanel locale="zh" referralClient={api} sessionRef="session_test" onSessionInvalid={onSessionInvalid} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("登录已过期");
  expect(onSessionInvalid).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "重新加载" })).not.toBeInTheDocument();
});

test("a late create response cannot reveal a previous account link after switching accounts", async () => {
  const api = client();
  const pending = deferred<{ eligible: boolean; linkPath: string; policy: typeof policy; attributionDays: number }>();
  api.createLink.mockReturnValueOnce(pending.promise);
  const view = render(<ReferralRewardsPanel locale="zh" referralClient={api} sessionRef="portal_browser_session" sessionGeneration={1} />);
  await screen.findByText("8");
  fireEvent.click(screen.getByRole("button", { name: "生成推荐链接" }));
  view.rerender(<ReferralRewardsPanel locale="zh" referralClient={api} sessionRef="portal_browser_session" sessionGeneration={2} />);
  await screen.findByText("8");
  await act(async () => pending.resolve({ ...profile, linkPath }));
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.queryByText("推荐链接已生成，可复制分享。")).not.toBeInTheDocument();
});
