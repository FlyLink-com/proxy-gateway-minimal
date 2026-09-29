import { useLayoutEffect, useRef, useState } from "react";

import { PortalCoinCommerceClientError } from "../commerce-client";
import type { PortalCoinCommerceClient, PortalCoinDataPackSubscription } from "../api-contract";

type Props = {
  commerceClient: PortalCoinCommerceClient;
  sessionRef: string;
  sessionGeneration: number;
  orderRef: string;
  locale: "zh" | "en";
  onSessionInvalid: () => void;
};

function label(locale: Props["locale"], zh: string, en: string) {
  return locale === "zh" ? zh : en;
}

function usageLabel(delivery: PortalCoinDataPackSubscription, locale: Props["locale"]) {
  const usage = delivery.usage;
  if (usage.collectionStatus === "pending" || usage.usedBytes === null) {
    return label(locale, "等待计量数据", "Waiting for usage data");
  }
  const prefix = label(locale, "已用", "Used");
  const suffix = usage.collectionStatus === "stale"
    ? label(locale, "（数据待更新）", " (data awaiting update)") : "";
  return `${prefix} ${usage.usedBytes.toLocaleString()} / ${usage.totalBytes.toLocaleString()} B${suffix}`;
}

// Mount only inside one expanded order. Closing it removes the credential from
// React state and DOM; it is never persisted in storage or embedded in a URL.
export function PortalDataPackSubscription({
  commerceClient, sessionRef, sessionGeneration, orderRef, locale, onSessionInvalid
}: Props) {
  const [delivery, setDelivery] = useState<PortalCoinDataPackSubscription | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const pendingRotationRef = useRef<string | null>(null);
  const generation = useRef(0);

  // Fence the initial identity before the freshly mounted action can be used.
  // A passive effect could run after a quick click and strand `busy` when its
  // generation changed while the already-resolved delivery was settling.
  useLayoutEffect(() => {
    generation.current += 1;
    setDelivery(null);
    setBusy(false);
    setMessage("");
    setShowLink(false);
    setConfirmReset(false);
    pendingRotationRef.current = null;
    return () => { generation.current += 1; };
  }, [commerceClient, sessionRef, sessionGeneration, orderRef]);

  const handleFailure = (error: unknown) => {
    if (error instanceof PortalCoinCommerceClientError
      && error.code === "commerce_session_invalid") {
      onSessionInvalid();
    } else {
      setMessage(label(locale, "操作未确认，请重试。", "Operation unconfirmed. Please retry."));
    }
  };

  const refresh = async () => {
    if (busy || pendingRotationRef.current) return;
    const requestGeneration = generation.current;
    setBusy(true);
    setDelivery(null);
    setShowLink(false);
    setMessage("");
    try {
      const result = await commerceClient.getDataPackDelivery({ sessionRef, orderRef });
      if (requestGeneration === generation.current) setDelivery(result);
    } catch (error) {
      if (requestGeneration === generation.current) handleFailure(error);
    } finally {
      if (requestGeneration === generation.current) setBusy(false);
    }
  };

  const rotate = async () => {
    if (busy) return;
    const requestGeneration = generation.current;
    const rotationRef = pendingRotationRef.current
      ?? `rotation_${crypto.randomUUID().replaceAll("-", "")}`;
    pendingRotationRef.current = rotationRef;
    setConfirmReset(false);
    setBusy(true);
    setDelivery(null); // The old credential may already have been revoked.
    setShowLink(false);
    setMessage("");
    try {
      await commerceClient.rotateDataPackDelivery({ sessionRef, orderRef, rotationRef });
      if (requestGeneration !== generation.current) return;
      pendingRotationRef.current = null;
      const result = await commerceClient.getDataPackDelivery({ sessionRef, orderRef });
      if (requestGeneration === generation.current) setDelivery(result);
    } catch (error) {
      if (requestGeneration === generation.current) handleFailure(error);
    } finally {
      if (requestGeneration === generation.current) setBusy(false);
    }
  };

  const copy = async () => {
    if (!delivery || busy) return;
    try {
      await navigator.clipboard.writeText(delivery.subscriptionUrl);
      setMessage(label(locale, "订阅已复制", "Subscription copied"));
    } catch {
      setMessage(label(locale, "复制失败，请手动查看订阅。", "Copy failed; view the subscription instead."));
    }
  };

  return (
    <div className="portal-data-pack-subscription" aria-label={label(locale, "流量包交付", "Data-pack delivery")}>
      {!delivery && !pendingRotationRef.current ? (
        <button type="button" disabled={busy} onClick={() => void refresh()}>
          {label(locale, "获取订阅", "Get subscription")}
        </button>
      ) : null}
      {delivery ? (
        <>
          <p role="status">{usageLabel(delivery, locale)}</p>
          {delivery.usage.exhausted === true ? (
            <p>{label(locale, "流量已用尽，此流量包已停供。", "This data pack is exhausted.")}</p>
          ) : null}
          <div className="portal-data-pack-subscription__actions">
            <button type="button" disabled={busy} onClick={() => void refresh()}>
              {label(locale, "刷新用量", "Refresh usage")}
            </button>
            <button type="button" disabled={busy} onClick={() => void copy()}>
              {label(locale, "复制订阅", "Copy subscription")}
            </button>
            <button type="button" disabled={busy} onClick={() => setShowLink((value) => !value)}>
              {showLink ? label(locale, "隐藏订阅", "Hide subscription")
                : label(locale, "查看订阅", "View subscription")}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirmReset(true)}>
              {label(locale, "重置订阅", "Reset subscription")}
            </button>
          </div>
          {showLink ? <p className="portal-data-pack-subscription__url">{delivery.subscriptionUrl}</p> : null}
          {confirmReset ? (
            <div className="portal-data-pack-subscription__confirm">
              <p>{label(locale, "旧订阅链接将失效；已用流量不会清零。", "The old link will stop working; usage will not reset.")}</p>
              <button type="button" onClick={() => void rotate()}>{label(locale, "确认重置", "Confirm reset")}</button>
              <button type="button" onClick={() => setConfirmReset(false)}>{label(locale, "取消", "Cancel")}</button>
            </div>
          ) : null}
        </>
      ) : null}
      {pendingRotationRef.current && !busy ? (
        <button type="button" onClick={() => void rotate()}>
          {label(locale, "重试重置订阅", "Retry subscription reset")}
        </button>
      ) : null}
      {busy ? <p role="status">{label(locale, "正在处理…", "Processing…")}</p> : null}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
