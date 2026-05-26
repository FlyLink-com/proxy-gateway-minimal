import { useMemo, useState, type FormEvent } from "react";
import { Check, Copy, Download, FileText, LifeBuoy, LockKeyhole, ShieldCheck } from "lucide-react";
import type { AdminApiClient } from "../subscriptions/api-client";
import type { SubscriptionTenant } from "../subscriptions/types";
import { copyText } from "../../lib/clipboard";
import { cn } from "../../lib/utils";

type PortalPlanId = "starter" | "professional" | "team";
type PortalClientId = "clash" | "mihomo" | "karing";

type PortalPlan = {
  id: PortalPlanId;
  label: string;
  price: string;
  description: string;
  quota: string;
};

type CreatedSubscription = {
  tenant: SubscriptionTenant;
  subscriptionUrl: string;
  clientTarget: PortalClientId;
};

const plans: PortalPlan[] = [
  {
    id: "starter",
    label: "Starter",
    price: "Trial",
    description: "Single user onboarding with one controlled subscription.",
    quota: "1 profile"
  },
  {
    id: "professional",
    label: "Professional",
    price: "Standard",
    description: "Default plan for stable daily subscription refresh.",
    quota: "3 profiles"
  },
  {
    id: "team",
    label: "Team",
    price: "Managed",
    description: "Multiple users with operator-reviewed lifecycle changes.",
    quota: "10 profiles"
  }
];

const clientTargets: Array<{ id: PortalClientId; label: string }> = [
  { id: "clash", label: "Clash" },
  { id: "mihomo", label: "Mihomo" },
  { id: "karing", label: "Karing" }
];

function expiresAtFromDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function selectedPlanLabel(planId: PortalPlanId) {
  return plans.find((plan) => plan.id === planId)?.label ?? "Professional";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Subscription generation failed.";
}

export function UserPortalPage({
  apiClient,
  onBackToAdmin
}: {
  apiClient: AdminApiClient;
  onBackToAdmin?: () => void;
}) {
  const [selectedPlan, setSelectedPlan] = useState<PortalPlanId>("professional");
  const [clientTarget, setClientTarget] = useState<PortalClientId>("clash");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [durationDays, setDurationDays] = useState("30");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreatedSubscription | null>(null);
  const [copied, setCopied] = useState(false);

  const activePlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlan) ?? plans[1],
    [selectedPlan]
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setCopied(false);
    try {
      const result = await apiClient.createTenant({
        displayName: displayName.trim(),
        expiresAt: expiresAtFromDays(Number(durationDays)),
        note: `portal plan=${selectedPlan}; client=${clientTarget}; email=${email.trim()}`
      });
      setCreated({
        tenant: result.tenant,
        subscriptionUrl: result.subscriptionUrl,
        clientTarget
      });
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setPending(false);
    }
  }

  async function copySubscriptionUrl() {
    if (!created) return;
    await copyText(created.subscriptionUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="portal-shell">
      <header className="portal-header">
        <a className="portal-brand" href="#/portal" aria-label="Proxy Gateway user portal">
          <span className="portal-brand-mark">PG</span>
          <span>Proxy Gateway</span>
        </a>
        <nav className="portal-nav" aria-label="User portal navigation">
          <a href="#plans">Plans</a>
          <a href="#download">Download</a>
          <a href="#docs">Docs</a>
          {onBackToAdmin ? (
            <a
              href="#"
              onClick={(event) => {
                event.preventDefault();
                onBackToAdmin();
              }}
            >
              Operator console
            </a>
          ) : null}
        </nav>
      </header>

      <section className="portal-main">
        <div className="portal-copy">
          <p className="eyebrow">Subscription Portal</p>
          <h1>Create your subscription</h1>
          <p>
            Register a profile, generate a visible-once import link, and send it to the client from
            this screen.
          </p>
          <div className="portal-trust-row" aria-label="Portal safeguards">
            <span><LockKeyhole aria-hidden="true" /> Private</span>
            <span><ShieldCheck aria-hidden="true" /> Opaque ready</span>
            <span><Check aria-hidden="true" /> V2 profile</span>
          </div>
        </div>

        <form className="portal-panel portal-form" onSubmit={submit}>
          <div>
            <p className="eyebrow">Step 1</p>
            <h2>Choose plan</h2>
          </div>
          <div className="portal-plan-grid" id="plans">
            {plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                className={cn("portal-plan", selectedPlan === plan.id && "portal-plan-active")}
                onClick={() => setSelectedPlan(plan.id)}
                aria-pressed={selectedPlan === plan.id}
              >
                <span>{plan.label}</span>
                <strong>{plan.price}</strong>
                <small>{plan.quota}</small>
              </button>
            ))}
          </div>
          <p className="portal-plan-copy">{activePlan.description}</p>

          <div className="portal-field-grid">
            <label>
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="customer@example.com"
                required
              />
            </label>
            <label>
              <span>Display name</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Customer Alpha"
                required
              />
            </label>
            <label>
              <span>Duration</span>
              <select value={durationDays} onChange={(event) => setDurationDays(event.target.value)}>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="365">365 days</option>
              </select>
            </label>
            <label>
              <span>Client</span>
              <select value={clientTarget} onChange={(event) => setClientTarget(event.target.value as PortalClientId)}>
                {clientTargets.map((target) => (
                  <option key={target.id} value={target.id}>{target.label}</option>
                ))}
              </select>
            </label>
          </div>

          {error ? <div className="alert alert-error">{error}</div> : null}

          <button className="primary-button portal-submit" type="submit" disabled={pending}>
            {pending ? "Generating" : "Generate subscription"}
          </button>
        </form>
      </section>

      <section
        className="portal-distribution"
        role="region"
        aria-label="Subscription distribution"
      >
        <div className="portal-panel">
          <p className="eyebrow">Step 2</p>
          <h2>{created ? "Subscription ready" : "Distribution queue"}</h2>
          {created ? (
            <div className="portal-result">
              <div>
                <strong>{created.tenant.displayName}</strong>
                <span>{selectedPlanLabel(selectedPlan)} / {created.clientTarget}</span>
              </div>
              <code>{created.subscriptionUrl}</code>
              <button className="ghost-button" type="button" onClick={copySubscriptionUrl}>
                <Copy aria-hidden="true" />
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          ) : (
            <p className="muted">Generate a subscription to prepare the user-facing import link.</p>
          )}
        </div>

        <div className="portal-action-grid">
          <a className="portal-action" href="#download" id="download">
            <Download aria-hidden="true" />
            <span>Download client</span>
            <small>Clash / Mihomo / Karing</small>
          </a>
          <a className="portal-action" href="#docs" id="docs">
            <FileText aria-hidden="true" />
            <span>Import guide</span>
            <small>Subscription V2 profile</small>
          </a>
          <a className="portal-action" href="#support">
            <LifeBuoy aria-hidden="true" />
            <span>Support</span>
            <small>Manual operator review</small>
          </a>
        </div>
      </section>
    </main>
  );
}
