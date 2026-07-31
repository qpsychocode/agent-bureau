# Visual assets — Agent Bureau Office

## Canonical reference

- `public/og.png` — the approved source art and social image.
- Aspect ratio: `1672 × 941`.
- The current approved version uses English title treatment.
- Do not edit or replace it without a new explicit user decision.

## Dynamic scene v2 — historical intermediate layer

Created on 2026-07-31 with the built-in ImageGen after the requirement to
separate agents from the monolithic image and support animation and pool growth.

### Empty interior

- File: `public/office-empty-v2.png`; superseded by the personalized v3 layout.
- Source: `public/og.png` as the edit target.
- Prompt intent: remove only the five robots and their chairs; reconstruct the
  background behind them; preserve the pixel style, perspective, furniture,
  lighting, palette, composition, English title, and subtitle; add no characters,
  extra text, watermark, or framing change.

### Role sprites

- Final files:
  `public/agents/{orchestrator,researcher,coder,reviewer,designer,copywriter,marketing,image}.png`.
- Derived atlas: `public/agents/atlas-v1.png`.
- Style source: `public/og.png`.
- Prompt intent: eight separate full-body pixel-art robots in a regular `4 × 2`
  atlas: orchestrator with a teal scarf and pointer, researcher with a magnifying
  glass, developer with a laptop, verifier with a checklist, designer in a purple
  beret, copywriter with a notebook, marketer with a chart tablet, and illustrator
  with a drawing tablet. Use one scale, a 3/4 front view, no text or watermark,
  and a flat chroma-key background.
- The chroma key was removed with the local ImageGen helper; the atlas was split
  reproducibly with `scripts/crop-agent-atlas.py`.
- `public/agents/designer.png` received an alpha-channel repair in the purple
  beret so office pixels no longer show through it.

## Render contract

- The background contains environment only.
- Each agent is rendered as a separate DOM button using its role sprite.
- An unknown role receives a deterministic fallback sprite from `agentId + role`.
- Role color, status, coordinates, and animation are code-driven rather than
  baked into the background.
- Hover and keyboard focus reveal an upward-looking eye treatment. The effect is
  an independent layer/frame; it does not move the entire character.
- Pointer hover does not draw a rectangular hotspot over the art. Keyboard focus
  remains visible through a compact label/accent treatment.

## Custom departments v3

- Final working file: `public/office-departments-v3.png`.
- Sources: `public/office-empty-v2.png` as the edit target and `public/og.png` as
  the style and character reference.
- Prompt intent: preserve the English title, night city, lighting, palette,
  perspective, and pixel scale while creating exactly eight empty offices. Top:
  teal Researcher archive, enlarged Orchestrator command room, cyan/coral Verifier
  QA room. Bottom: green Developer, purple Designer, amber Copywriter, pink
  Marketing, and orange Illustrator. Give each one distinct boundaries, a desk,
  furniture, and role-specific props; add no characters, extra rooms, labels, or
  watermark.
- Runtime mapping: `STAGE_SLOTS` in `app/page.tsx`; additional live roles remain
  in the digital annex rather than being placed over another role's furniture.

## Reusable builder offices

- Files:
  `public/offices/{orchestrator,researcher,reviewer,coder,designer,copywriter,marketing,image}.webp`.
- These are eight reproducible crops from the approved
  `public/office-departments-v3.png` layout, not independently styled duplicates.
- Coordinates and export logic are documented in
  `scripts/crop-office-templates.py`.
- The builder overlays the selected PNG avatar as a separate DOM layer, so one
  office can be assigned to multiple new agents without regenerating art.
