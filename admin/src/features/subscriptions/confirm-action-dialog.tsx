export type ConfirmActionTone = "danger" | "default";

type ConfirmActionDialogProps = {
  open: boolean;
  title: string;
  tenantName: string;
  consequence: string;
  confirmLabel: string;
  tone?: ConfirmActionTone;
  pending?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmActionDialog({
  open,
  title,
  tenantName,
  consequence,
  confirmLabel,
  tone = "default",
  pending = false,
  error = "",
  onCancel,
  onConfirm
}: ConfirmActionDialogProps) {
  if (!open) return null;

  const confirmClassName = tone === "danger" ? "danger-button" : "primary-button";

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="confirm-action-title">
        <div className="modal-header">
          <div>
            <h3 id="confirm-action-title">{title}</h3>
            <p className="muted">{tenantName}</p>
          </div>
          <button className="ghost-button" type="button" onClick={onCancel} disabled={pending}>
            Close
          </button>
        </div>

        <p className="modal-copy">{consequence}</p>
        {error ? <div className="alert alert-error">{error}</div> : null}

        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button className={confirmClassName} type="button" onClick={onConfirm} disabled={pending}>
            {pending ? "Working" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
