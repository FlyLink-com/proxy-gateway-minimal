# Subscription Provisioning Record


```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: template_subscription_provisioning
  superseded_by: null
  last_verified_at: 2026-08-16
  production_authority: false
```


Date: 2026-05-xx, Asia/Shanghai
Operator: [Operator Name]

## 1. Context

- **Purpose**: [e.g. Small-batch rollout for 5 early access users]
- **Production Quantity**: [e.g. 5]
- **Approval Reference**: [e.g. PR #265 / Slack thread]

## 2. Configuration Parameters

- **Expiry Time**: [e.g. 2026-06-30T00:00:00Z]
- **Bound Channel**: [e.g. channel-lab-b-tuic]
- **Operator Remarks**: [Any context or special instructions]

## 3. Provisioning Log

*Note: Do NOT include raw tokens, artifact secrets, subscription URLs, or raw YAML here.*

| Alias / Tenant ID (Hashed or Masked) | Status | Handoff File Location |
| --- | --- | --- |
| tenant-a-*** | Issued | `handoff/user-a-delivery.txt` |
| tenant-b-*** | Issued | `handoff/user-b-delivery.txt` |

## 4. Verification

- [ ] Operator verified CLI execution was successful and safe packages were generated
- [ ] Database state reviewed via `sqlite3` status/count queries (no row dumps)
- [ ] Output handoff files are strictly within `handoff/` (ignored) or securely stored as `0600` on the operator machine
- [ ] Raw URLs or secrets have NOT been pasted into chat, terminal outputs, PR descriptions, or committed to Git

## 5. Rollback / Revocation Plan (If needed)

- Artifact Revoke Procedure: See SOP
- Tenant Disable Procedure: See SOP
