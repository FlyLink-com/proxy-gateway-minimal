import { useState, type FormEvent } from "react";
import type { CreateSubscriptionInput } from "./types";

type CreateSubscriptionDialogProps = {
  onCreate: (input: CreateSubscriptionInput) => Promise<string>;
};

function nextMonthIsoDate() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().slice(0, 10);
}

export function CreateSubscriptionDialog({ onCreate }: CreateSubscriptionDialogProps) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [expiresAt, setExpiresAt] = useState(nextMonthIsoDate());
  const [note, setNote] = useState("");
  const [createdUrl, setCreatedUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function close() {
    setOpen(false);
    setCreatedUrl("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const url = await onCreate({
        displayName: displayName.trim(),
        expiresAt: new Date(`${expiresAt}T00:00:00.000Z`).toISOString(),
        note: note.trim()
      });
      setCreatedUrl(url);
      setDisplayName("");
      setNote("");
      setExpiresAt(nextMonthIsoDate());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Create subscription failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button className="primary-button" type="button" onClick={() => setOpen(true)}>
        Create subscription
      </button>

      {open ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="create-subscription-title">
            <div className="modal-header">
              <div>
                <h3 id="create-subscription-title">Create subscription</h3>
                <p className="muted">Generate a tenant-specific subscription link.</p>
              </div>
              <button className="ghost-button" type="button" onClick={close}>Close</button>
            </div>

            <form className="form-stack" onSubmit={submit}>
              {error ? <div className="alert alert-error">{error}</div> : null}
              <label>
                <span>User name</span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  required
                  placeholder="customer-a"
                />
              </label>
              <label>
                <span>Expires at</span>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                  required
                />
              </label>
              <label>
                <span>Note</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="manual subscription"
                  rows={3}
                />
              </label>
              <div className="modal-actions">
                <button className="ghost-button" type="button" onClick={close}>Cancel</button>
                <button className="primary-button" type="submit" disabled={pending}>{pending ? "Creating" : "Create"}</button>
              </div>
            </form>

            {createdUrl ? (
              <div className="visible-once">
                <strong>Visible once URL</strong>
                <code>{createdUrl}</code>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
