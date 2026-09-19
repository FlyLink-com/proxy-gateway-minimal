import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef
} from "react";

type ModalFrameProps = {
  children: ReactNode;
  closeDisabled?: boolean;
  closeLabel?: string;
  footer?: ReactNode;
  onClose: () => void;
  panelClassName?: string;
  subtitle?: ReactNode;
  title: string;
  titleId: string;
};

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function ModalFrame({
  children,
  closeDisabled = false,
  closeLabel = "Close",
  footer,
  onClose,
  panelClassName,
  subtitle,
  title,
  titleId
}: ModalFrameProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
  );

  useEffect(() => {
    // Snapshot the previously-focused element so the cleanup can restore focus
    // to the exact node captured at mount, even if `restoreFocusRef` has
    // since been reassigned by another component instance.
    const restoreFocusTo = restoreFocusRef.current;
    titleRef.current?.focus();
    return () => {
      restoreFocusTo?.focus();
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!closeDisabled) {
        onClose();
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
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={["modal-panel", panelClassName].filter(Boolean).join(" ")}
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <div className="modal-header">
          <div>
            <h3 id={titleId} ref={titleRef} tabIndex={-1}>{title}</h3>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          <button className="ghost-button" type="button" onClick={onClose} disabled={closeDisabled}>
            {closeLabel}
          </button>
        </div>
        {children}
        {footer ? <div className="modal-actions">{footer}</div> : null}
      </section>
    </div>
  );
}
