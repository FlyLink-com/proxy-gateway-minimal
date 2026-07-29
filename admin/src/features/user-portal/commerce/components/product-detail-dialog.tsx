import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef
} from "react";
import { portalCoinTypeListLabel } from "../../portal-commerce-presentation";
import type { PortalCoinOffer } from "../api-contract";

type CommerceLocale = "zh" | "en";

type CoinsDialogFrameProps = {
  busy?: boolean;
  children: ReactNode;
  closeDisabled?: boolean;
  closeLabel: string;
  escapeCloseEnabled: boolean;
  footer?: ReactNode;
  onRequestClose: () => void;
  onRestoreFocus?: () => void;
  panelClassName: string;
  title: string;
};

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function CoinsDialogFrame({
  busy = false,
  children,
  closeDisabled = false,
  closeLabel,
  escapeCloseEnabled,
  footer,
  onRequestClose,
  onRestoreFocus,
  panelClassName,
  title
}: CoinsDialogFrameProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const restoreFocusRef = useRef(onRestoreFocus);
  restoreFocusRef.current = onRestoreFocus;

  useEffect(() => {
    titleRef.current?.focus();
    return () => {
      restoreFocusRef.current?.();
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (escapeCloseEnabled) {
        onRequestClose();
      }
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []
    );
    if (focusable.length === 0) {
      event.preventDefault();
      titleRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (
      event.shiftKey
      && (
        document.activeElement === first
        || document.activeElement === titleRef.current
      )
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="portal-coins-dialog-backdrop" role="presentation">
      <section
        aria-busy={busy || undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`portal-coins-dialog ${panelClassName}`}
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <header className="portal-coins-dialog__header">
          <h2 id={titleId} ref={titleRef} tabIndex={-1}>{title}</h2>
          <button
            disabled={closeDisabled}
            type="button"
            onClick={onRequestClose}
          >
            {closeLabel}
          </button>
        </header>
        <div className="portal-coins-dialog__body">{children}</div>
        {footer ? (
          <footer className="portal-coins-dialog__actions">{footer}</footer>
        ) : null}
      </section>
    </div>
  );
}

export type ProductDetailDialogProps = {
  locale: CommerceLocale;
  offer: PortalCoinOffer;
  onPreview: () => void;
  onRequestClose: () => void;
  onRestoreFocus?: () => void;
};

function deliveryText(offer: PortalCoinOffer, locale: CommerceLocale) {
  if (offer.delivery.kind === "subscription_plan") {
    return locale === "zh"
      ? `${offer.delivery.durationDays} 天 · 每月 ${offer.delivery.monthlyTrafficGb} GB`
      : `${offer.delivery.durationDays} days · ${offer.delivery.monthlyTrafficGb} GB monthly`;
  }
  return locale === "zh"
    ? `${offer.delivery.trafficGb} GB · 永不过期`
    : `${offer.delivery.trafficGb} GB · never expires`;
}

export function ProductDetailDialog({
  locale,
  offer,
  onPreview,
  onRequestClose,
  onRestoreFocus
}: ProductDetailDialogProps) {
  const localized = locale === "zh" ? offer.title.zh : offer.title.en;
  const summary = locale === "zh" ? offer.summary.zh : offer.summary.en;
  const notices = locale === "zh"
    ? offer.importantNotices.zh
    : offer.importantNotices.en;

  return (
    <CoinsDialogFrame
      closeLabel={locale === "zh" ? "关闭" : "Close"}
      escapeCloseEnabled
      onRequestClose={onRequestClose}
      onRestoreFocus={onRestoreFocus}
      panelClassName="portal-coins-product-detail-dialog"
      title={localized}
      footer={(
        <button
          className="portal-coins-dialog__primary"
          type="button"
          onClick={onPreview}
        >
          {locale === "zh" ? "预览 Coins 结算" : "Preview Coins checkout"}
        </button>
      )}
    >
      <p>{summary}</p>
      <dl>
        <div>
          <dt>{locale === "zh" ? "交付" : "Delivery"}</dt>
          <dd>{deliveryText(offer, locale)}</dd>
        </div>
        <div>
          <dt>{locale === "zh" ? "可用 Coins" : "Accepted Coins"}</dt>
          <dd>{portalCoinTypeListLabel(offer.acceptedCoinTypes, locale)}</dd>
        </div>
      </dl>
      <ul>
        {notices.map((notice) => <li key={notice}>{notice}</li>)}
      </ul>
    </CoinsDialogFrame>
  );
}
