import { ModalFrame } from "../../components/modal-frame";

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
    <ModalFrame
      titleId="confirm-action-title"
      title={title}
      subtitle={tenantName}
      onClose={onCancel}
      closeDisabled={pending}
      footer={
        <>
          <button className="ghost-button" type="button" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button className={confirmClassName} type="button" onClick={onConfirm} disabled={pending}>
            {pending ? "Working" : confirmLabel}
          </button>
        </>
      }
    >
      <p className="modal-copy">{consequence}</p>
      {error ? <div className="alert alert-error">{error}</div> : null}
    </ModalFrame>
  );
}
