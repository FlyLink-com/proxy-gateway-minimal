# Migration Notes

Phase 1 modularizes the backend without changing the Windows proxy chain.

Preserved runtime contract:

- Console: `127.0.0.1:4077`
- SOCKS5: `127.0.0.1:1080`
- HTTP proxy: `127.0.0.1:18180`
- Startup command: `npm run server`
- Windows system proxy script: `scripts/proxy.ps1`

The old static UI stays under `public/`. Phase 2 will add a React/Vite UI that consumes `GET /api/status` and reuses the existing control endpoints.
