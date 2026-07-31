# Decision register — Agent Bureau Office

This file records verifiable decisions rather than agents' private reasoning:
what was chosen, why, which alternatives were rejected, and when to revisit it.

## ADR-001 — Local-first live telemetry

- **Status:** accepted, extended by ADR-011
- **Date:** 2026-07-31
- **Decision:** the first version runs entirely on `127.0.0.1`.
- **Why:** live agents run on the user's computer; a local path is faster, more
  private, and requires no account, cloud database, or inbound access to the Mac.
- **Rejected alternative:** send live local telemetry directly to Vercel without
  a separate relay and access model.
- **Cost:** the public site shows a demo, while a live shift is visible only next
  to a running local collector.
- **Revisit when:** the office must be viewed from a phone or multiple machines.

## ADR-002 — The visualization is a read-only observer

- **Status:** accepted
- **Decision:** Pixel Office cannot start, stop, approve, or continue agent work.
- **Why:** failure in the visual interface must not affect the agent loop or
  introduce a new source of infinite retries.
- **Consequence:** agent control remains with the orchestrator and Codex.
- **Revisit when:** a separate permission model and explicit user confirmations
  exist for control actions.

## ADR-003 — Use a normalized event stream

- **Status:** accepted
- **Decision:** the UI reads one collector state, not transcripts or internal
  Codex files.
- **Sources:** Codex Hooks and future `bureauctl` events.
- **Why:** transcripts are not a stable API; a dedicated schema allows telemetry
  sources to change without rebuilding the interface.
- **Storage:** `.bureau/events.jsonl` as an append-only log and
  `.bureau/state.json` as the current snapshot.
- **Revisit when:** Bureau owns an App Server session and needs a richer
  thread/turn/item stream.

## ADR-004 — Send only allowlisted safe fields

- **Status:** accepted
- **Decision:** the collector accepts role, task, status, model, effort, phase, a
  short summary, and verification verdict.
- **Never send:** prompts, responses, transcripts, tool input/output, diffs, file
  contents, absolute paths, or secrets.
- **Why:** the pixel scene needs operational status only; raw data increases
  leakage risk without improving observation.
- **Note:** the interface may show an agent-authored decision summary, but never
  hidden chain-of-thought.

## ADR-005 — Hooks do not make decisions

- **Status:** accepted
- **Decision:** the telemetry hook is always advisory; it never returns `deny`,
  `block`, or `continue: false`.
- **Why:** an observer must not change the approval flow or restart a completed
  agent loop.
- **Verification:** `Stop` and `SubagentStop` return neutral
  `{"continue":true}`; other events finish with empty stdout.

## ADR-006 — Pixel scene over ordinary DOM/CSS

- **Status:** superseded by ADR-010
- **Historical decision:** the first scene was built entirely in React and CSS,
  without a game engine.
- **Why superseded:** CSS characters and rooms were only approximate and diverged
  visually from the approved pixel-art scene.
- **Still valid:** accessibility, responsiveness, and interaction remain normal
  DOM/CSS; the collector stays separate from rendering.

## ADR-007 — Researcher runs through a dedicated Cursor adapter

- **Status:** accepted
- **Date:** 2026-07-31
- **Decision:** external research uses `Cursor Grok 4.5 High Fast` in Ask mode
  through Cursor Agent CLI.
- **Why:** the ordinary Codex subagent pool does not provide Grok; a separate
  adapter can use a Cursor subscription and observe the actual model.
- **Guard:** the adapter selects a canonical slug containing `grok-4.5`, `high`,
  and `fast`, then compares the normalized `model` field in the initial
  `stream-json` event with that entry's display name or canonical slug. A mismatch
  blocks the task without silent substitution.
- **Isolation:** Cursor runs in a separate empty workspace with a sandbox; the
  user's project root is not marked trusted or passed to Researcher.
- **Cost:** Cursor Agent CLI must be installed and authenticated; Fast consumes
  limits more quickly than the standard mode.
- **Rejected alternative:** treat `service_tier: priority` in the direct xAI API
  as equivalent to Cursor Fast.
- **Revisit when:** Cursor changes the slug or CLI contract, or the orchestrator
  gains a native provider adapter.

## ADR-008 — Bound execution and verification loops

- **Status:** accepted
- **Date:** 2026-07-31
- **Decision:** no more than two revision rounds are allowed after the first
  delivery.
- **Why:** a verifier must not turn a fixable task into an infinite loop.
- **Rule:** every issue includes a criterion, evidence, `issue_id`, and closure
  condition; an old issue cannot be repeated without new evidence.
- **After the limit:** the orchestrator accepts with a recorded risk, narrows the
  task, changes worker/model, or escalates the choice to the user.

## ADR-009 — Markdown is the source of truth for future RAG

- **Status:** accepted
- **Date:** 2026-07-31
- **Decision:** context, ADRs, lessons, and research reports live in Markdown;
  future RAG indexes those documents and links back to the originals.
- **Why:** files remain readable, portable, and Git-friendly without a vector
  database.
- **Do not store:** private model reasoning. Store decisions, concise rationale,
  evidence, consequences, and revisit conditions.
- **Revisit when:** full-text search no longer finds relevant paraphrased
  decisions.

## ADR-010 — `public/og.png` is the canonical office scene

- **Status:** superseded by ADR-013 for the render path; retained as style and
  social-image reference
- **Date:** 2026-07-31
- **Decision:** the approved `public/og.png`, now with English title treatment,
  is the immutable visual basis for Pixel Office. Hierarchy, accessible hotspot
  buttons, labels, routes, task packets, selection state, and assignment details
  are separate DOM/CSS layers.
- **Why:** the user approved this composition, characters, lighting, palette, and
  pixel-art character. Rebuilding it from approximate CSS shapes lost differences
  between agents and broke visual continuity.
- **Rejected alternative:** rebuild similar rooms and generic robots as CSS
  sprites.
- **Overlay limit:** the interactive layer may explain state and task routing but
  must not redraw, hide, or replace key scene art.
- **Consequence:** hotspots and routes follow the source image's `1672 × 941`
  ratio; responsive rendering preserves that ratio or scrolls the scene.
- **Revisit when:** the user explicitly approves a new source scene or requests
  an illustration change.

## ADR-011 — The public Vercel site is a demo mirror

- **Status:** accepted
- **Date:** 2026-07-31
- **Decision:** source is published in a public GitHub repository and the Next.js
  UI is deployed to Vercel. The cloud version uses the bundled demo snapshot;
  the local version continues to read live events from `127.0.0.1:7331`.
- **Production URL:** `https://agent-bureau.vercel.app`.
- **Why:** the user gets a permanent link to the visual experiment without
  opening inbound access to the computer or publishing local telemetry.
- **Security:** `.bureau`, `.env`, `.vercel`, build outputs, and local package
  caches are excluded from Git. The public UI does not proxy the collector.
- **Build:** `vinext build` remains the local/Sites runtime check, while
  `vercel.json` explicitly selects `next build` for Vercel.
- **Revisit when:** an authenticated outbound-only mirror of live events is
  required.

## ADR-012 — Art-first viewport and permanent roster

- **Status:** accepted; visual chrome superseded by ADR-017 and scene layering
  extended by ADR-013
- **Date:** 2026-07-31
- **Decision:** the first screen is the canonical office scene fitted into the
  viewport. Assignment details open in a dismissible panel without resizing the
  scene. The original persistent HUD and open roster were later removed by
  ADR-017.
- **Hierarchy:** the orchestrator occupies a fixed upper slot; specialists occupy
  functional slots. SVG routes and clickable packets show task direction.
- **Live model:** the bundled demo roster defines the permanent team. A live
  snapshot updates matching records by `id` or normalized role. Unmatched roster
  members remain `standby`; additional live agents join the pool without
  displacing canonical positions.
- **Why:** collector state is incomplete by definition: no event does not mean a
  role disappeared. The visual reference remains primary and telemetry explains
  it.
- **Rejected alternatives:** replace the roster with every snapshot; permanently
  reserve a column for the inspector; crop the scene on narrow viewports.
- **Verification:** a snapshot with only Researcher retains eight participants
  and reports `1 live · 7 standby`; details open only after an agent or packet is
  selected.

## ADR-013 — Separate the interior from animated agents

- **Status:** accepted; layout superseded by ADR-014
- **Date:** 2026-07-31
- **Decision:** `public/og.png` remains the canonical style reference and social
  image, while the working scene uses two independent layers: the empty
  `public/office-empty-v2.png` interior and role PNG sprites from
  `public/agents/`. Every agent is a DOM button with a sprite layer, status
  animation, label, and accessible task inspector.
- **Why:** the monolithic illustration reproduced the reference exactly but could
  not show a new agent, state change, or pool growth without regenerating the
  whole scene.
- **Scaling:** every agent has stable DOM identity; an unknown role receives a
  deterministic fallback sprite, so a new `agentId` does not break rendering.
  Placement rules are refined in ADR-014.
- **Animation:** new nodes enter through `agent-arrive`; `planning`, `working`,
  `reviewing`, `revision`, `blocked`, `done`, and `idle` have distinct CSS
  keyframes; `prefers-reduced-motion` disables continuous movement.
- **Invariants:** the interior, title, palette, lighting, and pixel-art character
  preserve the approved reference; generic CSS robots are not used.
- **Verification:** the demo shows eight distinct sprites; a live snapshot with
  one Researcher shows `1 live · 7 standby`; computed sprite styles use the
  matching status animation names.

## ADR-014 — Eight roles receive eight personalized offices

- **Status:** accepted
- **Date:** 2026-07-31
- **Decision:** `public/office-departments-v3.png` contains exactly eight empty,
  visually separated work areas. `STAGE_SLOTS` assigns each permanent role to its
  office rather than placing overflow sprites between other desks.
- **Upper level:** Researcher archive; enlarged central Orchestrator command room;
  Verifier QA lab.
- **Lower level:** Developer, Designer, Copywriter, Marketer, and Illustrator from
  left to right. Furniture, lighting, and props encode each role without baked-in
  text labels.
- **Hierarchy:** the Orchestrator office is higher and materially larger. SVG
  routes leave it for all seven specialists.
- **Pool growth:** unknown or duplicate live roles are not placed in corridors.
  They remain clickable in the Team popover and digital-annex counter. Adding a
  physical office requires an explicit layout extension so it stays personalized.
- **Rejected alternative:** generic hot-desk points over existing furniture,
  which made agents look as though they were standing between workstations.
- **Verification:** the demo roster shows eight sprites, each inside a distinct
  room; no permanent agent enters `stage.overflow`.

## ADR-015 — New agents are local profiles assembled from reusable parts

- **Status:** accepted
- **Date:** 2026-07-31
- **Decision:** `ADD AGENT` opens a data-driven builder with eight offices, eight
  avatars, and a required system prompt. The result is stored in `localStorage`
  and joins the digital annex and Team roster without source changes.
- **Boundary:** the builder creates a profile but does not present it as a running
  model. Until a trusted local runtime adapter connects, the inspector clearly
  marks the runtime as unconnected.
- **Privacy:** the system prompt remains only in the local definition record; it
  is not copied into observed telemetry, task summaries, or DOM cards.
- **Scaling:** at most 40 custom profiles are stored; the oldest is displaced only
  when the limit is exceeded. Deletion is available in the inspector.
- **Identity:** local profiles use the `custom-*` namespace; empty, duplicate, and
  reserved IDs are rejected. Exact roster IDs win before role fallback during
  live merge, and extras receive unique render IDs.
- **Why:** adding a specialist should be a data operation rather than scene
  development, but a static site must not imitate a real LLM launch.
- **Verification:** the user can choose any office/avatar pair, enter a prompt,
  see the profile after reload, and delete it; the prompt does not appear in the
  DOM or reach the collector.

## ADR-016 — Runtime profiles are provider-agnostic and separate from telemetry

- **Status:** accepted
- **Date:** 2026-07-31
- **Decision:** available runtimes are data in `config/runtime-providers.json`.
  A v2 profile stores `providerId`, `adapterId`, arbitrary model/reasoning values,
  and, when needed, an endpoint and environment-variable name. The catalog marks
  an adapter `fixed` or `editable` and declares endpoint/env fields as
  `required`, `optional`, or `none`. Both the form and v2 parser enforce these
  policies. A provider appears in the builder without a React change.
- **Requested vs actual:** a runtime profile expresses user intent. Actual
  provider/model/reasoning values are trusted only after an event from a trusted
  local adapter and are never replaced by profile values.
- **Secrets:** the browser stores only an environment-variable name. API keys,
  tokens, and shell commands are forbidden in profiles and catalogs; the local
  process reads the secret value at launch.
- **Compatibility:** v1 profiles migrate to an explicit `unconfigured` runtime
  and are deleted only after a successful v2 write. Model ID and reasoning do not
  use a global allowlist because provider catalogs change independently.
- **Vercel boundary:** the static deployment edits configuration only. It never
  calls a local endpoint, starts a CLI, or claims that a selected model works.
- **Why:** open-source users need Codex, Cursor, Claude Code, OpenAI-compatible,
  and custom runners without forking the UI, but extensibility must not turn JSON
  into remote code execution.
- **Verification:** five starter runtimes come from the catalog; an arbitrary safe
  model persists after reload; no secret is entered; the card clearly labels
  requested configuration; tests reject malformed endpoint/env values and
  duplicate providers.

## ADR-017 — English, art-first chrome and compact Team controls

- **Status:** accepted
- **Date:** 2026-07-31
- **Decision:** all built-in interface copy, demo content, metadata, office title,
  and social art use English. The persistent `OBSERVER v0.5` HUD and always-open
  roster are removed. A compact `TEAM` button opens the roster above a separate
  `ADD AGENT` action that remains visible at every supported viewport width.
- **Interaction:** the Team popover closes on outside click or `Escape`, restores
  focus to its trigger, and closes before an agent inspector opens. Mobile uses a
  single-column, vertically scrolling popover; desktop may use two columns.
- **Character response:** pointer hover and keyboard focus move the gaze upward
  through an independent eye frame/layer. The old rectangular pointer-hover aura
  is removed, while a compact keyboard focus treatment remains visible.
- **Asset repair:** unintended transparent pixels in the Designer's purple beret
  are filled so the office no longer shows through the hat.
- **Why:** persistent diagnostic chrome competed with the approved office art,
  and an Add action placed inside a horizontally scrolling roster could be
  obscured as the pool grew. English makes the public open-source demo broadly
  legible.
- **Verification:** no visible built-in Cyrillic remains; no observer/version/
  clock HUD is rendered; Team supports click, keyboard, `Escape`, and focus
  restoration; Add Agent remains fully visible at desktop and 320 px widths;
  hover/focus changes only the gaze; the Designer beret is opaque.
