import { useState, type FormEvent } from "react";
import { ModalFrame } from "../../components/modal-frame";
import { dateInputToIsoUtc, isoDateFromOffsetMonths } from "../../lib/date-input";
import { errorMessage } from "../../lib/errors";
import type { CreateSubscriptionInput } from "./types";

type CreateSubscriptionDialogProps = {
  onCreate: (input: CreateSubscriptionInput) => Promise<string>;
};

export function CreateSubscriptionDialog({ onCreate }: CreateSubscriptionDialogProps) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [expiresAt, setExpiresAt] = useState(isoDateFromOffsetMonths(1));
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
        expiresAt: dateInputToIsoUtc(expiresAt),
        note: note.trim()
      });
      setCreatedUrl(url);
      setDisplayName("");
      setNote("");
      setExpiresAt(isoDateFromOffsetMonths(1));
    } catch (requestError) {
      setError(errorMessage(requestError, "Create subscription failed."));
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
        <ModalFrame
          titleId="create-subscription-title"
          title="Create subscription"
          subtitle="Generate a tenant-specific subscription link."
          onClose={close}
        >
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
        </ModalFrame>
      ) : null}
    </>
  );
}
