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
          <button className="ghost-button" type="button" onClick={close}>Close</button>
        </div>

        <p className="modal-copy">
          Resetting the token creates a new visible-once subscription URL. The previous token stops refreshing after reset.
        </p>
        {error ? <div className="alert alert-error">{error}</div> : null}

        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={close}>Cancel</button>
          <button className="danger-button" type="button" onClick={() => void resetToken()} disabled={pending}>
            {pending ? "Resetting" : "Reset token"}
          </button>
        </div>

        {result ? (
          <div className="visible-once">
            <strong>Visible once URL</strong>
            <code>{result.subscriptionUrl}</code>
          </div>
        ) : null}
      </section>
    </div>
  );
}
