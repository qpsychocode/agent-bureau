# LUNA-MAX-CODER-01 — Switch active coding assignments to Luna Max

- **Status:** completed
- **Date:** 2026-08-03
- **Objective:** replace active GPT-5.6 Terra assignments with GPT-5.6 Luna at
  Max reasoning.
- **Decision:** use `gpt-5.6-luna` + `max` in `coder-primary` and migrate the
  active demo assignments that still named GPT-5.6 Terra.
- **Why:** the user's explicit coding preference, informed by their benchmark
  and cost comparison.
- **Acceptance:** routing requires exact model and effort attestation; active
  demo snapshots contain no `gpt-5.6-terra`; historical ADRs remain auditable.
- **Runtime evidence:** the local model catalog currently lists Luna with
  `low`, `medium`, `high`, `xhigh`, and `max`.
