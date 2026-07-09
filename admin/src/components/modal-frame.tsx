import type { ReactNode } from "react";

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
  return (
    <div className="modal-backdrop" role="presentation">
      <section className={["modal-panel", panelClassName].filter(Boolean).join(" ")} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-header">
          <div>
            <h3 id={titleId}>{title}</h3>
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
