import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Copy, RotateCcw } from "lucide-react";

import { PortalCoinCommerceClientError } from "../commerce-client";
import type { PortalCoinCommerceClient, PortalCoinDataPackSubscription } from "../api-contract";
import { CoinsDialogFrame } from "./product-detail-dialog";
import { useDataPackPendingRotations } from "../data-pack-rotation-context";

type Props = {
  commerceClient: PortalCoinCommerceClient;
  sessionRef: string;
  sessionGeneration: number;
  orderRef: string;
  locale: "zh" | "en";
  onSessionInvalid: () => void;
  autoLoad?: boolean;
  theme?: "light" | "dark";
};

function label(locale: Props["locale"], zh: string, en: string) {
  return locale === "zh" ? zh : en;
}

// Mount only inside an expanded order or completed checkout. Closing removes the credential from
// React state and DOM; it is never persisted in storage or embedded in a URL.
export function PortalDataPackSubscription({
  commerceClient, sessionRef, sessionGeneration, orderRef, locale, onSessionInvalid,
  autoLoad = true, theme = "dark"
}: Props) {
  const [delivery, setDelivery] = useState<PortalCoinDataPackSubscription | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const resetButtonRef = useRef<HTMLButtonElement>(null);
  const pendingRotationRef = useRef<string | null>(null);
  const [pendingRotation, setPendingRotation] = useState<string | null>(null);
  const pendingRotations = useDataPackPendingRotations({ commerceClient, sessionRef, sessionGeneration });
  const generation = useRef(0);

  // Fence the initial identity before the freshly mounted action can be used.
  // A passive effect could run after a quick click and strand `busy` when its
  // generation changed while the already-resolved delivery was settling.
  useLayoutEffect(() => {
    generation.current += 1;
    setDelivery(null);
    setBusy(false);
    setMessage("");
    setCopied(false);
    setCopying(false);
    setConfirmReset(false);
    pendingRotationRef.current = pendingRotations.get(orderRef) ?? null;
    setPendingRotation(pendingRotationRef.current);
    return () => { generation.current += 1; };
  }, [commerceClient, sessionRef, sessionGeneration, orderRef, pendingRotations]);

  const handleFailure = (error: unknown) => {
    if (error instanceof PortalCoinCommerceClientError
      && error.code === "commerce_session_invalid") {
      onSessionInvalid();
    } else {
      setMessage(label(locale, "操作未确认，请重试。", "Operation unconfirmed. Please retry."));
    }
  };

  const load = async () => {
    if (pendingRotationRef.current) return;
    const requestGeneration = generation.current;
    setBusy(true);
    setDelivery(null);
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

  const refresh = () => { if (!busy) void load(); };

  // The latest handler is independent of fetch identity: locale/callback renders
  // must not restart delivery reads. Automatic checkout delivery is GET only.
  const refreshRef = useRef(load);
  useLayoutEffect(() => { refreshRef.current = load; });
  useEffect(() => {
    if (!autoLoad) return;
    void refreshRef.current();
    return () => { generation.current += 1; };
  }, [autoLoad, commerceClient, sessionRef, sessionGeneration, orderRef]);

  const rotate = async () => {
    if (busy) return;
    const requestGeneration = generation.current;
    const rotationRef = pendingRotationRef.current
      ?? `rotation_${crypto.randomUUID().replaceAll("-", "")}`;
    pendingRotationRef.current = rotationRef;
    setPendingRotation(rotationRef);
    pendingRotations.set(orderRef, rotationRef);
    setConfirmReset(false);
    setBusy(true);
    setDelivery(null); // The old credential may already have been revoked.
    setCopied(false);
    setMessage("");
    try {
      await commerceClient.rotateDataPackDelivery({ sessionRef, orderRef, rotationRef });
      if (pendingRotations.get(orderRef) === rotationRef) pendingRotations.delete(orderRef);
      if (requestGeneration !== generation.current) return;
      pendingRotationRef.current = null;
      setPendingRotation(null);
      const result = await commerceClient.getDataPackDelivery({ sessionRef, orderRef });
      if (requestGeneration === generation.current) setDelivery(result);
    } catch (error) {
      if (requestGeneration === generation.current) handleFailure(error);
    } finally {
      if (requestGeneration === generation.current) setBusy(false);
    }
  };

  const copy = async () => {
    if (!delivery || busy || copying) return;
    const requestGeneration = generation.current;
    setCopying(true);
    setMessage("");
    try {
      await navigator.clipboard.writeText(delivery.subscriptionUrl);
      if (requestGeneration === generation.current) setCopied(true);
    } catch {
      if (requestGeneration === generation.current) {
        setMessage(label(locale, "复制失败，请从链接框手动复制。", "Copy failed; copy the link from the field instead."));
      }
    } finally {
      if (requestGeneration === generation.current) setCopying(false);
    }
  };

  return (
    <div className="portal-data-pack-subscription" aria-label={label(locale, "流量包交付", "Data-pack delivery")}>
      {!delivery && !pendingRotation && !busy && message ? (
        <button type="button" onClick={refresh}>
          {label(locale, "重试读取订阅", "Retry reading subscription")}
        </button>
      ) : null}
      {delivery ? (
        <div className="portal-data-pack-subscription__toolbar">
          <input type="text" readOnly autoComplete="off" spellCheck={false}
            aria-label={label(locale, "订阅链接", "Subscription link")}
            value={delivery.subscriptionUrl} />
          <div className="portal-data-pack-subscription__actions">
            <button type="button" ref={copyButtonRef} disabled={busy || copying}
              aria-label={label(locale, "复制订阅", "Copy subscription")}
              title={label(locale, "复制订阅", "Copy subscription")} onClick={() => void copy()}>
              <Copy aria-hidden="true" size={18} />
            </button>
            <button type="button" ref={resetButtonRef} disabled={busy || copying}
              aria-label={label(locale, "重置订阅", "Reset subscription")}
              title={label(locale, "重置订阅", "Reset subscription")} onClick={() => setConfirmReset(true)}>
              <RotateCcw aria-hidden="true" size={18} />
            </button>
          </div>
        </div>
      ) : null}
      {pendingRotation && !busy ? (
        <button type="button" onClick={() => void rotate()}>
          {label(locale, "重试重置订阅", "Retry subscription reset")}
        </button>
      ) : null}
      {busy ? <p role="status">{label(locale, "正在处理…", "Processing…")}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      {confirmReset || copied ? (
        <div className="portal-coins-dialog-theme portal-data-pack-feedback" data-portal-theme={theme}
          onKeyDown={(event) => event.stopPropagation()}>
          <CoinsDialogFrame panelClassName="portal-data-pack-feedback__dialog"
            title={confirmReset ? label(locale, "重置订阅", "Reset subscription")
              : label(locale, "订阅已复制", "Subscription copied")}
            closeLabel={label(locale, "关闭", "Close")} escapeCloseEnabled
            onRequestClose={() => { setConfirmReset(false); setCopied(false); }}
            onRestoreFocus={() => (confirmReset ? resetButtonRef : copyButtonRef).current?.focus()}
            footer={confirmReset ? <>
              <button type="button" onClick={() => setConfirmReset(false)}>{label(locale, "取消", "Cancel")}</button>
              <button type="button" onClick={() => void rotate()}>{label(locale, "确认重置", "Confirm reset")}</button>
            </> : <button type="button" onClick={() => setCopied(false)}>{label(locale, "知道了", "Got it")}</button>}>
            {confirmReset ? <>
              <p>{label(locale, "重置后，之前的订阅将立即失效，需要重新复制并导入。是否确认重置？",
                "Resetting immediately invalidates the previous subscription. You will need to copy and import it again. Confirm reset?")}</p>
              <p>{label(locale, "已用流量不会清零", "Used traffic will not be reset")}</p>
            </> : <p>{label(locale, "你已复制订阅，请返回你的飞连 VPN／Clash 软件进行导入。",
              "Subscription copied. Return to your Flyline VPN / Clash app to import it.")}</p>}
          </CoinsDialogFrame>
        </div>
      ) : null}
    </div>
  );
}
