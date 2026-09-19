import { useCallback, useEffect, useRef, useState } from "react";
import { copyText } from "../../../shared/public/clipboard";
import {
  PortalReferralClientError,
  type PortalReferralClient,
  type PortalReferralProfile,
  type PortalReferralPerformance,
} from "./referral-client";

type Props = {
  locale: "zh" | "en";
  referralClient?: PortalReferralClient | null;
  sessionRef?: string | null;
  sessionGeneration?: number;
  onSessionInvalid?: () => void;
  onOpenWallet?: () => void;
};
type Snapshot = {
  owner: PortalReferralClient | null;
  profile: PortalReferralProfile;
  performance: PortalReferralPerformance;
};

// Cookie-backed sessions share a transport marker. The generation, not only
// that marker, isolates links, late reads, clipboard feedback and QR rendering.
export function ReferralRewardsPanel(props: Props) {
  return <ReferralRewardsContent key={`${props.sessionGeneration ?? 0}:${props.sessionRef ?? "none"}`} {...props} />;
}

function ReferralRewardsContent({ locale, referralClient = null, sessionRef = null, onSessionInvalid, onOpenWallet }: Props) {
  const zh = locale === "zh";
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [failureCode, setFailureCode] = useState("");
  const [retryable, setRetryable] = useState(true);
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState<"" | "created" | "copied" | "copy_failed" | "qr_failed">("");
  const [qrVisible, setQrVisible] = useState(false);
  const [qrImage, setQrImage] = useState("");
  const epoch = useRef(0);
  const reads = useRef(false);
  const mutation = useRef(false);
  const controllers = useRef(new Set<AbortController>());
  const lastRead = useRef(0);
  const readRevision = useRef(0);
  const autoRefreshBlocked = useRef(false);
  const invalidSession = useRef(onSessionInvalid);
  useEffect(() => { invalidSession.current = onSessionInvalid; }, [onSessionInvalid]);
  const fail = useCallback((error: unknown) => {
    const known = error instanceof PortalReferralClientError;
    const code = known ? error.code : "referral_request_failed";
    setFailureCode(code);
    setRetryable(known ? error.retryable : true);
    autoRefreshBlocked.current = known && !error.retryable;
    setPhase(code === "not_found" ? "unavailable" : "error");
    setSnapshot(null);
    setQrVisible(false);
    setQrImage("");
    if (code === "invalid_session") invalidSession.current?.();
  }, []);

  const load = useCallback(async () => {
    if (!referralClient || !sessionRef) { setPhase("unavailable"); return; }
    if (reads.current || mutation.current) return;
    reads.current = true;
    lastRead.current = Date.now();
    const generation = epoch.current;
    const revision = readRevision.current;
    const abort = new AbortController();
    controllers.current.add(abort);
    try {
      const input = { sessionRef, signal: abort.signal };
      const [profile, performance] = await Promise.all([
        referralClient.getProfile(input), referralClient.getPerformance(input),
      ]);
      if (generation !== epoch.current || revision !== readRevision.current || abort.signal.aborted) return;
      setSnapshot({ owner: referralClient, profile, performance });
      setPhase("ready");
      setFailureCode("");
      autoRefreshBlocked.current = false;
    } catch (error) {
      if (generation === epoch.current && revision === readRevision.current && !abort.signal.aborted) fail(error);
    } finally {
      controllers.current.delete(abort);
      if (generation === epoch.current) reads.current = false;
    }
  }, [referralClient, sessionRef, fail]);

  useEffect(() => {
    epoch.current += 1;
    reads.current = false;
    mutation.current = false;
    autoRefreshBlocked.current = false;
    setSnapshot(null); setPhase("loading"); setCreating(false);
    setFeedback(""); setQrVisible(false); setQrImage("");
    void load();
    const refresh = () => {
      if (!autoRefreshBlocked.current && document.visibilityState === "visible" && navigator.onLine !== false && Date.now() - lastRead.current >= 5000) void load();
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    const pending = controllers.current;
    return () => {
      epoch.current += 1;
      for (const controller of pending) controller.abort();
      pending.clear();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const current = snapshot?.owner === referralClient ? snapshot : null;
  const profile = current?.profile;
  const performance = current?.performance;
  const policy = profile?.policy;
  const attributionDays = profile?.attributionDays;
  const distributionAvailable = typeof attributionDays === "number" && Number.isSafeInteger(attributionDays) && attributionDays >= 1 && attributionDays <= 365;
  const link = profile?.eligible && distributionAvailable && profile.linkPath && /^\/r\/[A-Za-z0-9_-]{32}$/.test(profile.linkPath)
    ? new URL(profile.linkPath, window.location.origin).href : "";

  useEffect(() => {
    let cancelled = false;
    setQrImage("");
    if (qrVisible && link) {
      import("qrcode").then(({ default: qr }) => qr.toDataURL(link, { width: 192, margin: 2, errorCorrectionLevel: "M" }))
        .then((value) => { if (!cancelled) setQrImage(value); })
        .catch(() => { if (!cancelled) { setFeedback("qr_failed"); setQrVisible(false); } });
    }
    return () => { cancelled = true; };
  }, [qrVisible, link]);

  async function createLink() {
    if (!referralClient || !sessionRef || mutation.current || !profile?.eligible || !distributionAvailable) return;
    mutation.current = true; setCreating(true); setFeedback("");
    // A background GET started before this mutation must not overwrite the
    // newly generated link, even if its response arrives after the POST.
    readRevision.current += 1;
    const generation = epoch.current;
    const abort = new AbortController();
    controllers.current.add(abort);
    try {
      const next = await referralClient.createLink({ sessionRef, signal: abort.signal });
      if (generation !== epoch.current || abort.signal.aborted) return;
      setSnapshot((value) => value?.owner === referralClient ? { ...value, profile: next } : value);
      setFeedback("created");
    } catch (error) {
      if (generation === epoch.current && !abort.signal.aborted) fail(error);
    } finally {
      controllers.current.delete(abort);
      if (generation === epoch.current) { mutation.current = false; setCreating(false); }
    }
  }
  async function copyLink() {
    const generation = epoch.current;
    try {
      const copied = await copyText(link);
      if (generation === epoch.current) setFeedback(copied ? "copied" : "copy_failed");
    } catch { if (generation === epoch.current) setFeedback("copy_failed"); }
  }
  const number = (value: number) => new Intl.NumberFormat(zh ? "zh-CN" : "en-US").format(value);
  const errorText = failureCode === "invalid_session"
    ? (zh ? "登录已过期，请重新登录。" : "Your session expired. Please sign in again.")
    : failureCode === "referral_account_ineligible"
      ? (zh ? "当前账户暂不能参与推荐活动。" : "This account cannot currently participate in referrals.")
      : failureCode === "referral_policy_unavailable"
        ? (zh ? "推荐活动暂未开放，请稍后再试。" : "The referral program is not open yet. Please try later.")
        : (zh ? "推荐奖励暂时无法加载，请稍后重试。" : "Referral rewards could not be loaded. Please try again later.");
  const feedbackText = {
    "": "", created: zh ? "推荐链接已生成，可复制分享。" : "Your referral link is ready to share.",
    copied: zh ? "链接已复制" : "Link copied",
    copy_failed: zh ? "复制失败，请选中链接手动复制。" : "Copy failed. Select the link and copy it manually.",
    qr_failed: zh ? "二维码暂时无法显示，可复制链接分享。" : "The QR code is unavailable. You can still copy the link.",
  }[feedback];
  const metrics = performance ? [
    [zh ? "有效注册" : "Attributed registrations", number(performance.registrations)],
    ...(policy ? [
      [zh ? "首次充值人数" : "First recharges", number(performance.firstRechargeConversions)],
      [zh ? "待确认奖励" : "Pending rewards", `${number(performance.pendingRewardCoins)} Coins`],
      [zh ? "可用奖励" : "Available rewards", `${number(performance.availableRewardCoins)} Coins`],
    ] : []),
  ] : [];

  return <section className="portal-commerce-layout portal-commerce-layout--referral-rewards" aria-labelledby="portal-commerce-referral-heading">
    <header className="portal-commerce-layout__header">
      <h2 id="portal-commerce-referral-heading">{zh ? "推广绩效" : "Referral performance"}</h2>
      <p>{policy ? (zh ? "分享专属链接，查看好友首次充值带来的奖励。" : "Share your personal link and track rewards from friends’ first recharges.")
        : (zh ? "分享专属链接，邀请好友注册。" : "Share your personal link and invite friends to register.")}</p>
    </header>
    {phase === "loading" ? <p role="status">{zh ? "正在加载推荐奖励…" : "Loading referral rewards…"}</p> : null}
    {phase === "unavailable" ? <p role="status">{zh ? "推荐活动暂未开放。" : "The referral program is not open yet."}</p> : null}
    {phase === "error" ? <div className="portal-referral-notice" role="alert"><p>{errorText}</p>{retryable ? <button type="button" onClick={() => void load()}>{zh ? "重新加载" : "Try again"}</button> : null}</div> : null}
    {phase === "ready" && current ? <>
      <section className="portal-commerce-layout__section" aria-label={zh ? "推广指标" : "Referral metrics"}>
        <dl className="portal-commerce-layout__metrics">{metrics.map(([label, value]) => <div className="portal-commerce-layout__metric" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        {policy ? <div className="portal-referral-summary">
          <span>{zh ? "好友首充合计" : "First recharge total"}：{number(current.performance.creditedFirstRechargeCoins)} Coins</span>
          <span>{zh ? "充值转化率" : "Recharge conversion"}：{new Intl.NumberFormat(zh ? "zh-CN" : "en-US", { style: "percent", maximumFractionDigits: 1 }).format(current.performance.conversionRate)}</span>
          <span>{zh ? "已撤销奖励" : "Reversed rewards"}：{number(current.performance.reversedRewardCoins)} Coins</span>
        </div> : <p>{zh ? "奖励活动暂未开放。" : "The reward program is not open yet."}</p>}
        {policy && current.performance.reconciliationRequired ? <p role="status">{zh ? "部分奖励正在核对，确认后将更新。" : "Some rewards are being reviewed and will update after confirmation."}</p> : null}
        {policy && onOpenWallet ? <button type="button" className="portal-referral-wallet-link" onClick={onOpenWallet}>{zh ? "查看钱包明细" : "View Wallet activity"}</button> : null}
      </section>
      <section className="portal-commerce-layout__section" aria-labelledby="portal-referral-link-label">
        <h3 id="portal-referral-link-label">{zh ? "我的推荐链接" : "My referral link"}</h3>
        {!profile?.eligible ? <p>{zh ? "当前账户暂不能参与推荐活动。" : "This account cannot currently participate in referrals."}</p>
          : !distributionAvailable ? <p>{zh ? "推荐链接暂未开放。" : "Referral links are not available yet."}</p>
          : <p>{zh ? "专属链接长期保留，再次打开页面可继续使用。" : "Your personal link is saved and can be reused when you return."}</p>}
        {!policy && distributionAvailable ? <p>{zh ? `好友需在访问链接后 ${attributionDays} 天内注册。` : `Friends must register within ${attributionDays} days of visiting the link.`}</p> : null}
        {link ? <div className="portal-referral-share">
          <input aria-labelledby="portal-referral-link-label" readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
          <button type="button" className="portal-referral-primary" onClick={() => void copyLink()}>{zh ? "复制链接" : "Copy link"}</button>
          <button type="button" onClick={() => setQrVisible(!qrVisible)} aria-expanded={qrVisible}>{qrVisible ? (zh ? "隐藏二维码" : "Hide QR code") : (zh ? "显示二维码" : "Show QR code")}</button>
        </div> : <button className="portal-referral-primary" type="button" disabled={creating || !profile?.eligible || !distributionAvailable} onClick={() => void createLink()}>{creating ? (zh ? "正在生成…" : "Creating…") : (zh ? "生成推荐链接" : "Create referral link")}</button>}
        {feedbackText ? <p role="status">{feedbackText}</p> : null}
        {qrVisible && link ? <div className="portal-referral-qr">{qrImage ? <img src={qrImage} alt={zh ? "推荐链接二维码" : "Referral link QR code"} width={192} height={192} /> : <p role="status">{zh ? "正在生成二维码…" : "Generating QR code…"}</p>}</div> : null}
      </section>
      {policy ? <section className="portal-commerce-layout__section" aria-label={zh ? "奖励规则" : "Reward rules"}>
        <h3>{zh ? "奖励规则" : "Reward rules"}</h3>
        <p>{zh ? `好友通过链接注册并完成首次充值，你可获得其充值 Coins 的 ${number(policy.rateBps / 100)}% 作为奖励。` : `Earn ${number(policy.rateBps / 100)}% of the Coins credited by a referred friend’s first recharge.`}</p>
        <p>{zh ? `好友需在访问链接后 ${policy.attributionDays} 天内注册。奖励观察期为 ${policy.confirmationDays} 天，通过核验后转为可用 Coins。` : `Friends must register within ${policy.attributionDays} days of visiting the link. Rewards have a ${policy.confirmationDays}-day observation period and become available after verification.`}</p>
        <p>{zh ? "奖励仅限首次充值，不重复计算；退款可能撤销相应奖励。待确认奖励暂不可消费。" : "Only the first recharge qualifies. Rewards are not recursive and may be reversed after a refund. Pending rewards cannot be spent."}</p>
      </section> : null}
    </> : null}
  </section>;
}
