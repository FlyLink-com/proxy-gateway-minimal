# CLI Production Provisioning SOP

Last updated: 2026-05-29, Asia/Shanghai.

This document serves as the Standard Operating Procedure (SOP) for issuing and revoking user subscriptions via the platform CLI. It guarantees that all subscription handling remains operator-controlled, auditable, and secure.

> [!WARNING]
> This runbook is considered A-tier when executing against production environments for actual users. Follow the exact approval process before issuing real subscriptions.

## 1. Safety Rules & Boundaries

1. **No Raw Secrets in Repository or Chat**: Raw subscription URLs, `.env` file contents, artifact secrets, or full SQLite rows MUST NOT be committed to git, pasted in GitHub PRs, logged to terminals in a CI environment, or shared in chat with agents.
2. **Handoff Directory**: The actual generated `.txt` files meant for users must only be stored in the local `handoff/` directory (which is ignored by Git) or a secure `0600` path on the operator's machine.
3. **Approvals**: Bulk or small-batch generation of real subscriptions is an A-tier activity. It requires an explicit operator approval phrase.

## 2. Provisioning Procedure (Controlled Open)

Use this flow to convert a lead into a provisioned account, entitlement, and access grant.

### Step 2.1: Prepare Operator Form Facts

For subscription issuance preparation, prefer the operator provisioning form
contract before any execution path. It turns reviewed form facts into a safe
issuance input preview and still performs no database mutation:

```powershell
npm run platform:provisioning-form -- scripts/provisioning-form-input.example.json
```

See `docs/OPERATOR_PROVISIONING_FORM_CONTRACT.md`.

### Step 2.2: Prepare Controlled-Open Input

Create a JSON input file representing the batch or individual user. Store this locally (e.g. `handoff/batch-1-input.json`).
Refer to `scripts/mock-controlled-open-input.example.json` for the required format.

```json
{
  "lead": {
    "organization": "Example Corp",
    "email": "demo@example.com",
    "direction": "inbound",
    "stage": "approved",
    "message": "Approved test user for small batch rollout."
  },
  "account": { "status": "active" },
  "entitlement": {
    "status": "active",
    "plan": "premium",
    "validUntil": "2026-06-30T00:00:00.000Z"
  },
  "accessGrant": {
    "entryRef": "entry-dynamic-a1",
    "artifactRef": "artifact-premium-a1",
    "visibleOnce": true
  },
  "operator": { "requestedBy": "operator-cli" }
}
```

### Step 2.3: Execute CLI Tool

Run the controlled-open CLI. The output will be a safe metadata package.

```powershell
npm run platform:controlled-open -- handoff/batch-1-input.json > handoff/batch-1-output.json
```

### Step 2.4: Generate Handoff File

From the raw internal execution (which handles the secret generation), save the actual subscription URL or artifact string into a dedicated file strictly for user handoff.
Ensure it is saved as `handoff/user-A-delivery.txt`. Do NOT display the content in the terminal.

### Step 2.5: Database Verification

Verify the database state using safe queries. **DO NOT** use `SELECT *`.

```powershell
# Check total tenants and status overview
sqlite3 data/proxy.db "SELECT status, count(*) FROM subscription_tenants GROUP BY status;"
sqlite3 data/proxy.db "SELECT status, count(*) FROM subscription_artifacts GROUP BY status;"
```

## 3. Revocation / Rollback Procedure

If a subscription was issued in error, or access needs to be revoked, follow these steps.

### Step 3.1: Plan Revocation (Dry Run)

Run the revoke script in plan-only mode to generate a safety summary.

```powershell
npm run platform:revoke-access -- <tenant-id> --dry-run
```

Review the dry-run output to ensure you are targeting the correct tenant and artifacts.

### Step 3.2: Execute Revocation (Separate A-tier Approval Required)

The dry-run output is not execution authority. True revocation mutates
subscription state and therefore requires a separate exact-phrase A-tier
approval or an explicitly authorized production operation record.

After that approval, use the existing approved runbook or authorized operator
tooling to perform the following changes. The SQL below is an implementation
shape, not approval to run it.

1. Set the tenant status to `disabled`.
   ```sql
   UPDATE subscription_tenants SET status = 'disabled' WHERE id = '<tenant-id>';
   ```
2. Mark associated active opaque artifacts as `revoked` with a revocation
   timestamp.
3. Re-check public refresh behavior through the approved validation command.
4. Reload Nginx only if a separate Nginx/static-output gate explicitly requires
   it.

## 4. Audit & Record Keeping

After completion, fill out the `docs/production-replacement-records/TEMPLATE_SUBSCRIPTION_PROVISIONING.md` template.
Save it as `docs/production-replacement-records/YYYY-MM-DD-batch-provisioning.md` and commit it to the repository.
Ensure NO raw links or secrets are included in the markdown file.
