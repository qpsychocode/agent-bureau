# LUNA-CODER-01 — Pin Luna as the Coder model

- **Status:** completed
- **Date:** 2026-08-02
- **Objective:** make Luna, rather than Sol or Terra, the default model that
  writes and changes code in Agent Bureau workflows.
- **Decision:** add the mandatory `coder-primary` routing profile, require model
  attestation, and forbid silent substitution.
- **Why:** Luna is the user's explicit coding preference for quality and cost.
- **Acceptance:** the main skill directs Coder assignments to `coder-primary`;
  the routing reference covers all coding work; demo Coder metadata says Luna;
  unavailable Luna is reported rather than silently replaced.
- **Runtime limitation:** the exact model slug must come from the active runtime.
  A routing preference alone does not make an unavailable model executable.
