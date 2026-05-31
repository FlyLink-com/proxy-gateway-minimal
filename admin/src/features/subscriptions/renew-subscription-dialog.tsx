import { useEffect, useState, type FormEvent } from "react";
import { ModalFrame } from "../../components/modal-frame";
import { dateInputToIsoUtc } from "../../lib/date-input";
import { errorMessage } from "../../lib/errors";
import type { RenewSubscriptionInput, SubscriptionTenant } from "./types";

type RenewSubscriptionDialogProps = {
  tenant: SubscriptionTenant | null;
  onClose: () => void;
  onRenew: (input: RenewSubscriptionInput) => Promise<void>;
};

export function RenewSubscriptionDialog({
  tenant,
  onClose,
  onRenew
}: RenewSubscriptionDialogProps) {
  const [expiresAt, setExpiresAt] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setExpiresAt(tenant ? tenant.expiresAt.slice(0, 10) : "");
  }, [tenant]);

  if (!tenant) return null;
  const activeTenant = tenant;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await onRenew({
        id: activeTenant.id,
        expiresAt: dateInputToIsoUtc(expiresAt)
      });
      onClose();
    } catch (requestError) {
      setError(errorMessage(requestError, "Renew subscription failed."));
    } finally {
      setPending(false);
    }
  }

  return (
    <ModalFrame
      titleId="renew-subscription-title"
      title="Renew subscription"
      subtitle={activeTenant.displayName}
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        {error ? <div className="alert alert-error">{error}</div> : null}
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
          <button className="primary-button" type="submit" disabled={pending}>{pending ? "Renewing" : "Renew"}</button>
        </div>
      </form>
    </ModalFrame>
  );
}
