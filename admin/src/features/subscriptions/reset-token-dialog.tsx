import { useState } from "react";
import { ModalFrame } from "../../components/modal-frame";
import { errorMessage } from "../../lib/errors";
import type { ResetTokenResult, SubscriptionTenant } from "./types";

type ResetTokenDialogProps = {
  tenant: SubscriptionTenant | null;
  onClose: () => void;
  onReset: (id: string) => Promise<ResetTokenResult>;
};

export function ResetTokenDialog({ tenant, onClose, onReset }: ResetTokenDialogProps) {
  const [result, setResult] = useState<ResetTokenResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  if (!tenant) return null;
  const activeTenant = tenant;

  function close() {
    setResult(null);
    setError("");
    onClose();
  }

  async function resetToken() {
    if (pending || result) return;

    setPending(true);
    setError("");
    try {
      setResult(await onReset(activeTenant.id));
    } catch (requestError) {
      setError(errorMessage(requestError, "Reset token failed."));
    } finally {
      setPending(false);
    }
  }

  return (
    <ModalFrame
      titleId="reset-token-title"
      title="Reset token"
      subtitle={activeTenant.displayName}
      onClose={close}
      closeDisabled={pending}
    >
      <p className="modal-copy">
        Resetting this token invalidates the previous subscription URL. A replacement URL is generated after
        confirmation and is visible once in this dialog.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="modal-actions">
        {result ? (
          <button className="primary-button" type="button" onClick={close}>
            Done
          </button>
        ) : (
          <>
            <button className="ghost-button" type="button" onClick={close} disabled={pending}>
              Cancel
            </button>
            <button className="danger-button" type="button" onClick={() => void resetToken()} disabled={pending}>
              {pending ? "Resetting" : "Confirm reset token"}
            </button>
          </>
        )}
      </div>

      {result ? (
        <div className="visible-once">
          <strong>New visible-once URL</strong>
          <span>Copy this URL now. It will not be shown again after closing this dialog.</span>
          <code>{result.subscriptionUrl}</code>
        </div>
      ) : null}
    </ModalFrame>
  );
}
