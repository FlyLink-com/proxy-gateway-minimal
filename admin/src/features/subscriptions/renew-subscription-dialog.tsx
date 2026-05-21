import { useEffect, useState, type FormEvent } from "react";
import type { RenewSubscriptionInput, SubscriptionTenant } from "./types";

type RenewSubscriptionDialogProps = {
  tenant: SubscriptionTenant | null;
  onClose: () => void;
  onRenew: (input: RenewSubscriptionInput) => void;
};

export function RenewSubscriptionDialog({
  tenant,
  onClose,
  onRenew
}: RenewSubscriptionDialogProps) {
  const [expiresAt, setExpiresAt] = useState("");

  useEffect(() => {
    setExpiresAt(tenant ? tenant.expiresAt.slice(0, 10) : "");
  }, [tenant]);

  if (!tenant) return null;
  const activeTenant = tenant;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onRenew({
      id: activeTenant.id,
      expiresAt: new Date(`${expiresAt}T00:00:00.000Z`).toISOString()
    });
    onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="renew-subscription-title">
        <div className="modal-header">
          <div>
            <h3 id="renew-subscription-title">Renew subscription</h3>
            <p className="muted">{activeTenant.displayName}</p>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>Close</button>
        </div>

        <form className="form-stack" onSubmit={submit}>
          <label>
            <span>New expiry date</span>
            <input
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              required
            />
          </label>
          <div className="modal-actions">
            <button className="ghost-button" type="button" onClick={onClose}>Cancel</button>
            <button className="primary-button" type="submit">Renew</button>
          </div>
        </form>
      </section>
    </div>
  );
}
