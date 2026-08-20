# Production Incident Index

Last updated: 2026-08-16.

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: production_incident_index
  superseded_by: null
  last_verified_at: 2026-08-16
  production_authority: false
```


| Document | Purpose | Status | When to read |
| --- | --- | --- | --- |
| `docs/production-incident-records/2026-05-24-legacy-blue-connectivity-review.md` | Read-only legacy blue connectivity review and lifecycle decision record. | Execution record; legacy blue is preserved for review/controlled exit and should not become the future durable target. | Read before new blue/prod-edge-a planning, legacy blue retirement, or incident follow-up checks. |
| `docs/production-incident-records/2026-05-25-prod-edge-a-timeout-packetloss-preflight.md` | Read-only prod-edge-a timeout / packet-loss preflight across local, Aliyun, and host vantages. | Execution record; no production mutation, and sampled TCP/HTTP checks were healthy while ICMP was not authoritative. | Read before service restart, DNS change, prod-edge-b canary, traffic cutover, or data-plane observability follow-up. |
