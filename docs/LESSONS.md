# Project lessons — Agent Bureau Office

This file records repeatable failures and verifiable rules that prevent the same
mistakes. It is not a private-reasoning log: every lesson includes an observable
symptom, an adopted rule, and a verification method.

## LESSON-001 — Do not replace approved visual art with an approximation

- **Date:** 2026-07-31
- **Symptom:** instead of the approved pixel-art illustration, the interface
  showed rebuilt CSS rooms and similar-looking robots; the result felt like a
  different and materially weaker design.
- **Cause:** the reference was treated as broad stylistic direction even though
  it was already an approved visual result.
- **Rule:** when a scene or illustration is explicitly approved, use the exact
  asset as the canonical basis. Do not replace it with approximate CSS, SVG, or
  regenerated styling without a separate explicit user decision.
- **Allowed change:** independent interactive layers may be added above the
  canonical asset if they do not change or obscure key art.
- **Before delivery:** confirm the canonical file is in the final render path;
  characters and interior are not duplicated with homemade sprites; any
  departure is backed by a new ADR or direct user request.
- **Related decision:** ADR-010.

## LESSON-002 — A live snapshot must not erase the office roster

- **Date:** 2026-07-31
- **Symptom:** after one Researcher event, the interface showed only Researcher;
  the orchestrator and other specialists disappeared even though they are the
  permanent Bureau roster.
- **Cause:** the live snapshot replaced the demo roster instead of updating the
  presence and status of matched agents.
- **Rule:** live telemetry enriches the permanent roster. Match by `id` first,
  then normalized role. An agent without a fresh live event remains visible as
  `standby`, without an invented active task.
- **Before delivery:** a snapshot containing one Researcher must show
  `1 live · 7 standby`; all eight participants must remain available in Team;
  the orchestrator must retain its hierarchical position.
- **Related decision:** ADR-012.

## LESSON-003 — Approved art is not the same as a working scene model

- **Date:** 2026-07-31
- **Symptom:** the exact reference looked right, but agents remained pixels in one
  image and could not be animated, added, or moved independently.
- **Cause:** one visual asset represented the environment, characters, and
  application state at the same time.
- **Rule:** separate an immutable environment from entities in a live
  visualization. The interior may be raster art, but each agent needs stable DOM
  identity, a sprite, status, coordinates, and lifecycle animation.
- **Before delivery:** a new agent appears without changing the background asset;
  overflow remains in the annex/Team roster; status changes update the animation
  name; reduced motion preserves readability without movement.
- **Related decision:** ADR-013.

## LESSON-004 — A separate sprite does not guarantee a personal workspace

- **Date:** 2026-07-31
- **Symptom:** agents became animated DOM entities, but additional roles stood
  between offices and looked temporarily placed in a corridor.
- **Cause:** the entity model scaled while the layout still covered only the five
  original characters.
- **Rule:** a permanent role receives not only a sprite and coordinate but also a
  semantically appropriate room with its own furniture, lighting, and props. Do
  not disguise a missing room as a generic point above someone else's desk.
- **Before delivery:** eight permanent roles occupy eight visibly separated
  offices; overflow is not rendered over the building and remains available in
  the annex.
- **Related decision:** ADR-014.

## LESSON-005 — An extensible pool must be configuration, not a scene edit

- **Date:** 2026-07-31
- **Symptom:** every new specialist could require a manual role, coordinate,
  markup, and background change.
- **Cause:** visual entities were dynamic, but the workspace catalog and profile
  creation flow remained embedded in source code.
- **Rule:** separate an agent profile from runtime state. Office, avatar, and
  system prompt come from a data-driven catalog; observed state excludes the
  secret prompt and honestly reports whether a runtime is connected.
- **Before delivery:** a new profile is created in the UI, survives reload, does
  not occupy another role's physical slot, and is deleted without project
  changes. Exact permanent-roster ID matching precedes role matching; malformed
  and duplicate localStorage records have behavioral tests.
- **Related decision:** ADR-015.

## LESSON-006 — Selecting a runtime is not proof that it started

- **Date:** 2026-07-31
- **Symptom:** a card with a selected provider and model could look like proof
  that the agent already ran on that model.
- **Cause:** user configuration and observed telemetry attempted to share fields
  without an explicit trust boundary.
- **Rule:** requested runtime stays in the profile; actual runtime comes only from
  a local adapter after preflight/start. The UI labels the profile `CONFIG ONLY`
  and does not execute endpoints or shell commands from JSON.
- **Security:** store an environment-variable name, never an API key; reject URLs
  with credentials/query/hash and public client-side environment prefixes. Never
  auto-run an untrusted custom adapter merely because it appears in the catalog.
- **Before delivery:** arbitrary model/reasoning values pass; unsafe endpoint/env
  values are rejected; reload preserves a profile; actual-work fields change only
  from a live event.
- **Related decision:** ADR-016.

## LESSON-007 — Diagnostic chrome must not compete with the office

- **Date:** 2026-07-31
- **Symptom:** the persistent observer/version HUD and open horizontal roster
  obscured the art, while the Add Agent action could slide out of view as the
  roster grew. A rectangular hotspot made character hover feel like a debug tool
  rather than an expressive interaction.
- **Cause:** operational diagnostics and primary actions shared persistent scene
  space instead of appearing on demand.
- **Rule:** keep the office visually primary. Put the roster behind a compact Team
  control, keep Add Agent as a separate fixed sibling, and use character-level
  response rather than a rectangular pointer-hover overlay. Preserve an explicit
  keyboard focus indicator.
- **Before delivery:** no observer/version/clock HUD appears; Team closes on
  outside click and `Escape` and restores focus; Add Agent is visible at 320 px;
  gaze changes on hover and focus; `prefers-reduced-motion` remains respected.
- **Related decision:** ADR-017.

## LESSON-008 — Pixel-art typography still has to be readable

- **Date:** 2026-07-31
- **Symptom:** agent names, Team cards, and the creation form were visually
  consistent but too small to read; Team covered a lower-row label, and an
  inactive-looking Create button did not explain what was missing.
- **Cause:** screenshot-scale typography and decoration were prioritized over
  real viewport use, while identity and runtime requirements stayed implicit.
- **Rule:** decorative pixel styling does not justify microtype. Use explicit
  name and specialty fields, ordinary readable input sizes, dropdowns for known
  finite choices, and a visible validation message when submission is invalid.
- **Before delivery:** verify the closed scene, Team roster, and full builder in
  a real browser; check desktop and mobile widths; confirm controls do not cover
  agent labels; create/parse a named profile; inspect asset alpha instead of
  assuming transparency is only a visual illusion.
- **Related decision:** ADR-018.
