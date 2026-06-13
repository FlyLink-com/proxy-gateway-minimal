# Edge-Agent Future-Order Read-Only Preflight Approval Packet

Date: 2026-06-11, Asia/Shanghai.

Risk tier: A production read-only preflight.

Targets:

- Vultr Japan control plane: `45.76.222.52`
- Vultr Singapore data plane: `45.76.158.201`

This packet is a planning and approval packet. It is not itself production
approval and it does not authorize deployment, schema migration, service
restart, runtime apply, or live order creation. It does not contain raw
environment values, raw runtime config, raw logs, SQLite rows, account
credentials, subscription URLs, tokens, passwords, private keys, runtime
credential material, or customer data.

## Reason

The previous production activation established the private SGP edge-agent
pull/apply/receipt path for existing delivered Singapore channel credentials.
The current repository source now adds the control-plane side for future orders:

- delivered orders record a safe pending desired-state notification for
  `remote-data-plane-handoff` channels;
- remote Singapore channels remain withheld from user subscription output until
  the current desired-state has a matching applied receipt from the data plane;
- notification rows store only safe refs and status facts.

Before deploying that source line, production must be inventoried read-only so
the next deployment gate can name the exact current release, database posture,
agent posture, private tunnel posture, and rollback anchors.

## Scope Allowed After Exact Approval

Japan control plane read-only inventory:

- identify current runtime release and current symlink target;
- identify whether the deployed runtime already contains the future-order
  desired-state notification code path;
- check protected environment key presence by key name only, never value;
- check control DB schema posture by table/column presence only;
- summarize desired-state notification, desired-state, and applied-receipt
  aggregate counts without dumping rows;
- verify public boundaries:
  - portal static root;
  - subscription/public health;
  - public Admin blocked;
  - public internal data-plane agent route blocked;
  - no-session portal API rejection;
- verify loopback-only control routes:
  - `tcp/3456` remains loopback-only;
  - unauthenticated internal data-plane agent request returns unauthorized.

Singapore data-plane read-only inventory:

- identify `gccgw-edge-agent.service` status;
- identify private tunnel listener posture;
- identify Xray, Hysteria2, and TUIC service status;
- identify TCP 8443, UDP 10443, and UDP 443 listener presence;
- identify traffic-stats listener loopback-only posture;
- verify public Admin remains blocked;
- verify no public traffic-stats exposure.

Local repository/package inventory:

- identify current branch and commit;
- verify the source candidate that contains future-order notification code;
- do not upload artifacts or switch production runtime in this gate.

## Forbidden Actions

- DNS mutation;
- Nginx config mutation or reload;
- provider firewall mutation;
- artifact upload;
- release symlink switch;
- `npm ci` on production;
- production schema migration;
- protected environment write;
- proxy-gateway, Xray, Hysteria2, TUIC, Mihomo, or edge-agent restart;
- runtime config mutation;
- desired-state apply;
- live order creation;
- payment mutation;
- account or password generation;
- passkey enablement;
- subscription URL, token, password, private key, credential value, raw
  environment, raw config, raw log, SQLite row, or customer-data output;
- copying protected runtime config into Git.

## Validation Output

The read-only preflight may report only redacted summaries:

- Japan current release label;
- source candidate commit/release label;
- Japan health status;
- portal/sub public boundary status;
- public Admin and public internal route blocked status;
- no-session portal API rejection status;
- `tcp/3456` loopback-only status;
- control DB schema status:
  - desired-state notification table present or missing;
  - apply receipt table present or missing;
  - agent lease table present or missing;
- aggregate counts by safe status only, such as pending/applied/failed counts;
- SGP edge-agent status;
- SGP Xray/Hy2/TUIC status;
- SGP listener status for TCP 8443, UDP 10443, and UDP 443;
- SGP stats loopback-only status;
- whether the next runtime-upgrade gate is ready, blocked, or needs a revised
  artifact.

## Rollback

This gate is read-only. Rollback is limited to cleanup:

1. Close SSH sessions.
2. Delete local temporary inventory files if any were created.
3. Do not restore production files because no production files may be changed.

If any accidental mutation is detected, stop immediately and record the exact
mutation class without printing sensitive values. Do not continue into deploy or
apply work under this approval.

## Exact Approval Template

```text
批准执行 Vultr Japan/SGP edge-agent future-order desired-state 只读预检：
target=Vultr Japan control plane 45.76.222.52 + SGP data plane 45.76.158.201 only；
source_candidate=codex/edge-agent-source-absorption commit ce09ca7 read-only comparison only；
scope=read-only inventory only: current deployed release, source candidate identity, protected env key presence by key name only, control DB schema presence, desired-state notification/receipt aggregate counts without rows, Japan portal/sub/Admin/internal-route boundaries, tcp3456 loopback-only, SGP edge-agent/private-tunnel/Xray/Hy2/TUIC/listener/stats-loopback posture; no artifact upload, no release switch, no schema migration, no restart, no live order creation；
validation=Japan health 200, portal/sub public 200, Admin blocked, public internal agent route blocked, no-session portal APIs reject, tcp3456 loopback-only, unauthenticated internal agent request rejects, SGP agent status reported, SGP TCP8443/UDP10443/UDP443 listeners reported, stats loopback-only, notification/receipt schema status reported redacted, next deployment gate readiness classified；
rollback=read-only cleanup only: close sessions and remove temporary local inventory files; stop if any mutation is detected；
forbidden=DNS,Nginx config/reload,provider firewall,artifact upload,current symlink switch,npm ci on production,schema migration,protected env write,proxy/Xray/Hy2/TUIC/Mihomo/agent restart,runtime config mutation,desired-state apply,payment,account/password generation,live order creation,passkey enablement,subscription URL/token/password/private key/credential output,SQLite row dump,raw env/log/config output,copying protected runtime config into Git。
```

## Next Gate After Success

If this read-only preflight passes, the next separate Risk A gate should be a
runtime upgrade and migration gate that names:

- exact release and artifact SHA256;
- current production release discovered by this preflight;
- backup paths for Japan current symlink, protected env, proxy config, control
  DB, and subscription DB;
- whether schema migration is expected to create
  `platform_edge_desired_state_notifications`;
- allowed service restart scope;
- validation for a no-live-order deployment;
- a separately approved live-order smoke only after deployment validation.
