# Domain Implementation Index

| Document | Purpose | Status | When to read |
| --- | --- | --- | --- |
| `docs/domain-implementation-records/2026-05-24-stage0-preflight.md` | Read-only DNS/domain Stage 0 preflight facts. | Execution record; historical facts for the named date. | Read before requesting Gate 1 DNS/domain implementation approval. |
| `docs/domain-implementation-records/2026-05-24-stage1-dns-records-to-blue.md` | DNS/domain Stage 1 record for AliDNS A records pointing to current blue. | Execution record; DNS mutation only. | Read before Stage 2 HTTP-only domain validation or rollback. |
| `docs/domain-implementation-records/2026-05-24-stage2-http-only-validation.md` | DNS/domain Stage 2 record for HTTP-only public-boundary and Nginx log-redaction validation on current blue. | Execution record; read-only HTTP/Nginx validation. | Read before requesting Stage 3 HTTPS issuance approval. |
