# Edge Agent Scoped Receipt Render Gate Approval Packet


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: edge_agent_scoped_receipt_render_gate_approval_packet
  superseded_by: null
  last_verified_at: 2026-06-11
  production_authority: false
```


Date: 2026-06-11

Risk: A

Status: packaged approval packet only. No production mutation is authorized by
this document.

## Context

The scoped SGP smoke apply previously produced fresh scoped receipts, but the
subscription render proof still withheld SGP channels. The root cause was in the
control-plane render gate:

- aggregate channel receipts were accepted for remote data-plane channels;
- scoped desired-state receipts were intentionally stored separately;
- subscription rendering did not resolve the current order's edge credentials
  back to the matching scoped desired-state receipt.

That behavior is too strict for the approved smoke path. It prevents one tested
order from rendering SGP channels even when the edge-agent has applied exactly
that order's scoped credentials. It is still correct that scoped receipts must
not globally unlock SGP for unrelated orders.

## Source Candidate

- Branch: `codex/edge-agent-source-absorption`
- Runtime release:
  `edge-agent-scoped-receipt-render-gate-20260611-001-worktree`
- Artifact:
  `D:\Projects\proxy-gateway-minimal\.codex-artifacts\edge-agent-scoped-receipt-render-gate-20260611-001-worktree\proxy-gateway-edge-agent-scoped-receipt-render-gate-20260611-001-worktree.zip`
- SHA256:
  `ED2ED30A3B17EB2A58E382CB3F489097621FEBB82FAD01AD44C657DD89DAA744`

The package was generated from the current working tree into `.codex-artifacts`
after excluding local artifact/runtime scratch, Git metadata, dependency
folders, database files, logs, and key/certificate suffixes. This approval
packet was written after packaging and is not part of the archive.

## Source Behavior

The candidate adds a subscription render gate fallback for remote data-plane
channels:

- first accept the latest matching aggregate applied receipt for the channel;
- otherwise resolve the current portal order by tenant id;
- derive the expected scoped desired-state from that order's
  `edgeCredentialRef` values for the channel;
- accept only a fresh applied receipt whose `desiredStateRef` matches that
  scoped desired-state.

This means:

- one scoped smoke order can render SGP channels after matching scoped receipts;
- unrelated orders remain on the already-applied channels until their own
  scoped receipt or an aggregate receipt exists;
- aggregate receipts still unlock the whole remote channel as before.

## Local Validation

Executed locally with no production mutation:

```powershell
node --test server/tests/state.test.mjs server/tests/data-plane-agent-protocol.test.mjs server/tests/data-plane-agent-service.test.mjs server/tests/data-plane-agent-routes.test.mjs server/tests/production-edge-agent.test.mjs
npm test
npm run project-state:check
git diff --check
```

Results:

- targeted edge-agent/state tests: 65 passed, 0 failed;
- full server test suite: 755 passed, 0 failed;
- `project-state:check`: passed;
- `git diff --check`: passed with Windows LF/CRLF warnings only.

## Production Approval Template

Use this only after confirming the live current release by read-only inventory.

```text
批准执行 Vultr Japan/SGP edge-agent scoped receipt render gate 生产验证：
release=edge-agent-scoped-receipt-render-gate-20260611-001-worktree；
artifact=D:\Projects\proxy-gateway-minimal\.codex-artifacts\edge-agent-scoped-receipt-render-gate-20260611-001-worktree\proxy-gateway-edge-agent-scoped-receipt-render-gate-20260611-001-worktree.zip；
archive_sha256=ED2ED30A3B17EB2A58E382CB3F489097621FEBB82FAD01AD44C657DD89DAA744；
target=Vultr Japan control plane 45.76.222.52 + SGP data plane 45.76.158.201 only；
current_release=current deployed release after read-only inventory；
scope=read-only inventory; protected backups; upload verified artifact; npm ci; switch Japan current; restart Japan proxy-gateway-candidate.service only; install/update SGP scoped edge-agent source/service only if needed; choose exactly one reviewed existing test order; set EDGE_AGENT_EDGE_CREDENTIAL_REFS for that order only; run SGP dry-run and controlled apply; config-test Xray/Hy2/TUIC; restart only required approved SGP services; post redacted scoped receipts; run subscription render proof；
validation=artifact hash ok, npm ci ok, Japan health 200, portal/sub public 200, Admin blocked, public internal route blocked, no-session APIs reject, tcp3456 loopback-only, SGP agent active, TCP8443/UDP10443/UDP443 active, stats loopback-only, fresh scoped applied receipts exist, tested order render proof includes SGP channels after matching scoped receipts, unrelated order render proof does not rely on scoped receipts, no sensitive output；
rollback=restore Japan current symlink/protected env/proxy config/control DB/subscription DB and SGP agent/runtime backups, restart only affected approved services after config-test；
forbidden=DNS,Nginx config/reload,provider firewall,public Admin,payment,account/password generation,more than one live order,subscription URL/token/password/private-key/credential output,SQLite row dump,raw env/log/config output,copying protected runtime config into Git,unrelated service restart。
```

## Non-Goals

- No aggregate/full-channel receipt activation.
- No broad live order creation.
- No public Admin or public internal agent route.
- No DNS, Nginx, provider firewall, payment, passkey, or account mutation.
- No sensitive runtime material, subscription URL, token, private key,
  credential, SQLite row, raw env, raw log, or raw config output.
