# API Compatibility

Phase 1 keeps the existing `proxy-gateway-minimal` API surface stable.

Still supported:

- `GET /api/health`
- `POST /api/ss/start`
- `POST /api/ss/stop`
- `POST /api/http-proxy/start`
- `POST /api/http-proxy/stop`
- `POST /api/proxy/start`
- `POST /api/proxy/stop`
- `GET /api/proxy/overview`
- `GET /api/proxy/status`
- `GET /api/proxy/test`
- `GET /api/proxy/servers`
- `GET /api/nginx/status`
- `GET /api/ping/:host`
- `POST /api/system-proxy/:action`
- `POST /api/env-proxy/on`
- `POST /api/env-proxy/off`
- `GET /api/env-proxy/status`
- `POST /api/autostart/on`
- `POST /api/autostart/off`
- `GET /api/autostart/status`

New:

- `GET /api/status`
- `GET /api/network/status`
- `POST /api/network/repair`
- `POST /api/network/reset`

Control routes require the console token. `GET /api/health` and `GET /proxy.pac` remain public.
