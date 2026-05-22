import { useState } from "react";
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
      setError(requestError instanceof Error ? requestError.message : "Reset token failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="reset-token-title">
        <div className="modal-header">
          <div>
            <h3 id="reset-token-title">Reset token</h3>
            <p className="muted">{activeTenant.displayName}</p>
          </div>
          <button className="ghost-button" type="button" onClick={close} disabled={pending}>Close</button>
        </div>

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
      </section>
    </div>
  );
}
