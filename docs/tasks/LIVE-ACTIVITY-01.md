# LIVE-ACTIVITY-01 — Observable agent work

## Objective

Make the office answer, without opening an inspector: who is active, what each
agent is doing, which phase is current, and where the Orchestrator sent work.

## Decisions

- Use sanitized lifecycle events as the source of truth; do not infer activity
  from animation timers or transcripts.
- Give each lifecycle family a distinct label and motion, and animate only routes
  backed by a current assignment.
- Auto-start the loopback observer from trusted Codex hooks on a best-effort
  basis. Keep telemetry neutral to the actual task outcome.
- Let the public Vercel UI read the local observer directly from the user's
  browser through exact-origin, read-only CORS. This preserves local-only data
  and avoids provisioning a cloud database merely for live viewing. Declare the
  request target address space as `loopback` for current browser permission
  handling.
- Reset the current snapshot at a new run while retaining append-only history.
  Use a 180-second stale window so meaningful transitions do not disappear
  during normal implementation work.

## Rejected alternatives

- Generic bobbing for every non-idle status: it cannot explain the work.
- Publishing prompts, tool arguments, paths, or transcripts: unnecessary and
  unsafe for an observer.
- Provisioning cloud Redis before it is needed: adds cost, credentials, and a
  privacy boundary when the browser can read the user's loopback service.
- Infinite blocked/done animation: a terminal state should settle.

## Acceptance evidence

- Build and lint pass.
- Observer tests cover assignment lifecycle, transient tools, run reset,
  production-origin read-only CORS, and Private Network Access preflight.
- Browser QA shows the Orchestrator working, completed specialists, a planning
  Verifier, three active routes, distinct animation names, and a mobile activity
  strip.
- Independent Verifier verdict is recorded before release.

## Verification

- Initial verdict: `revision_required` for `ANIM-TERM-01`; terminal task packets
  still inherited the generic infinite float animation.
- Revision round: 1 of the maximum 2. Added static overrides for done, blocked,
  and stale packets plus a regression assertion.
- Final verdict: `approved`; no unresolved blocking issues.
- Requested verifier profile: worker-strong / GPT-5.6 Sol medium-high.
- Actual verifier runtime/model/effort: unverified by the current agent runtime.
