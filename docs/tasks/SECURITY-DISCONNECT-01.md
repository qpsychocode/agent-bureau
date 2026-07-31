# SECURITY-DISCONNECT-01 — Disconnect public Vercel from local Codex

- **Status:** completed
- **Date:** 2026-08-01
- **Objective:** prevent the public Agent Bureau deployment from reading the
  local Codex observer while preserving the private localhost office.
- **Decision:** gate collector polling to loopback-hosted pages and remove the
  Vercel origin from the observer's default CORS allowlist.
- **Why:** the hosted project is public and should be a demo surface, not an
  ambient bridge into local activity.
- **Acceptance:** production does not issue a request to `127.0.0.1:7331`; the
  observer rejects `https://agent-bureau.vercel.app`; localhost remains usable.
- **Privacy:** no secrets or local telemetry are copied into this task record.
