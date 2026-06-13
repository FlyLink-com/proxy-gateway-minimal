# Control Plane Node Registration Ingestion

Date: 2026-06-13

## Scope

Repo-only implementation for converting an approved no-secret node image
first-boot packet into a durable, safe control-plane node registration record.
This work does not authorize production node activation, protected material
handoff, DNS, Nginx, provider firewall, runtime service restart, live order
creation, or subscription material output.

## Plan

1. Add failing tests for first-boot packet to node registration ingestion.
2. Add a small ingestion service that accepts only approved first-boot packets.
3. Add a durable control DB table and store API for safe registered node facts.
4. Update current docs/state so future gates do not treat this as production
   activation.
5. Run targeted tests, full test baseline, project-state check, and diff check.

## Acceptance

- Approved first-boot packets create safe registration records with node,
  provider, region, role, channel, image, release, lifecycle, status, and receipt
  gate metadata.
- Packets without explicit first-boot apply approval are rejected.
- The control DB stores only safe refs and metadata; no raw runtime material,
  subscription URL, token, password, private key, raw IP inventory, or customer
  data is persisted by this path.
- Production activation remains a separate Risk A gate.
