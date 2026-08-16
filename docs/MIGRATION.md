# Migration Notes

Last updated: 2026-08-16.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: migration_notes
  superseded_by: null
  last_verified_at: 2026-08-16
  production_authority: false
```


Phase 1 modularizes the backend without changing the Windows proxy chain.

Preserved runtime contract:

- Console: `127.0.0.1:4077`
- SOCKS5: `127.0.0.1:1080`
- HTTP proxy: `127.0.0.1:18180`
- Startup command: `npm run server`
- Windows system proxy script: `scripts/proxy.ps1`

The old static UI stays under `public/`. Phase 2 will add a React/Vite UI that consumes `GET /api/status` and reuses the existing control endpoints.

## Subscription Recovery Boundary

The subscription architecture refactor keeps the service as a modular monolith. Recovery should prioritize the subscription delivery path before any future platform or payment integration.

Minimum files and data needed to restore existing subscription refreshes:

- Git-tracked application code.
- `.proxy-gateway/subscriptions.sqlite` or the path configured by `SUBSCRIPTION_DB_PATH`.
- `.env` values, including `CONSOLE_TOKEN`, `SS_PASSWORD`, `PUBLIC_SUBSCRIPTION_BASE_URL`, and rate-limit/admin allowlist settings.
- `config/proxy-servers.json` or the deployed node configuration.
- Nginx public path rules that expose only health checks and `/sub/clash.yaml`.
- systemd units for the app and Shadowsocks service on Linux deployments.

Future platform or payment data is not a runtime dependency of `/sub/clash.yaml`. A restored subscription core with its store and node config must be enough for existing valid tokens to refresh.

Future database migrations should add a new `SubscriptionStore` adapter instead of changing subscription business logic or HTTP route handlers.
