# Operator Lab Evidence Template

Last updated: 2026-05-25, Asia/Shanghai.

> Status:
> - Type: Operator Lab evidence template
> - Risk: C for this document
> - Execution authority: Does not authorize production, CI, staging, AWS,
>   DNS, Nginx, HTTPS, systemd, production config, node, tenant, artifact,
>   secret, SQLite, deploy, or cutover changes
> - Production impact: None

## Purpose

Standard template for recording HP Relay and Operator Lab observations.
All entries must be redacted before sharing or committing.

## Redaction Rules

```text
- Replace IP addresses with [redacted] unless they are loopback (127.x.x.x).
- Replace hostnames that identify production nodes with [redacted].
- Replace tokens, keys, passwords, and credentials with [redacted].
- Replace subscription URLs and opaque artifact paths with [redacted].
- Keep port numbers only when they are necessary for diagnosis.
- Redact Clash/Mihomo profile names that reveal user identity.
```

## Evidence Entry

```markdown
## Observation: [short title]

| Field | Value |
|---|---|
| Timestamp | YYYY-MM-DD HH:MM:SS Asia/Shanghai |
| Operator | [your initials] |
| Boundary | Operator Lab — local/experiment only |
| Not Production | yes |
| Not CI / Staging | yes |

### Profile Tested

| Item | Value |
|---|---|
| Channel type | disabled / direct-tcp / edge-tunnel |
| Edge host | [redacted / N/A] |
| Target | [redacted / N/A] |

### Run Summary

| Metric | Value |
|---|---|
| OK | true / false |
| Duration (ms) | [number] |
| Connect OK count | [number] |
| Connect failure count | [number] |
| Last failure class | [class or null] |

### Observations

[Describe what was seen. Keep it factual and redacted.]

### Hypotheses

[What do you think is happening? Mark clearly as hypothesis.]

### Follow-up Questions

- [question 1]
- [question 2]

### Promotion Notes

[Check against docs/operator-lab/PROMOTION_CHECKLIST.md only if relevant.]
```

## Template Usage

```powershell
# Run HP Relay and redirect output into a new observation file:
node agent/hp-relay.mjs --profile direct-tcp --target-host 127.0.0.1 --target-port 1080 > /tmp/hp-relay-evidence.json

# Then fill in the observation section above using the JSON output.
```

## Checklist Before Sharing

```text
[ ] All IPs redacted except loopback
[ ] All hostnames redacted
[ ] No tokens, keys, or passwords visible
[ ] No subscription URLs visible
[ ] Observation is factual, not speculative conclusion
[ ] Hypothesis is clearly labeled
[ ] Not confused with CI, staging, or production evidence
```
