# Project context — Agent Bureau Office

## Goal

Show the orchestrator and subagents as a live pixel office. Within seconds, the
user should understand who is working, on what, who is waiting for verification,
who is blocked, and which result has already been accepted.

## Current version

- Web UI: `http://localhost:3000`
- Local collector: `http://127.0.0.1:7331`
- Public source: `https://github.com/qpsychocode/agent-bureau`
- Public web: `https://agent-bureau.vercel.app` (Vercel demo)
- Combined start: `start-office.command` or `npm run office`
- Canonical style reference and English social image: `public/og.png`
  (`1672 × 941`)
- Working interior with eight personalized offices:
  `public/office-departments-v3.png`
- Separate role sprites: `public/agents/*.png`
- Layout: an art-first, full-screen scene with no persistent top observer HUD;
  a compact `TEAM` control opens the roster above a separate, always-visible
  `ADD AGENT` action; the selected assignment opens in an overlay drawer
- Scene interaction: DOM/CSS agent hotspots, visual hierarchy, task routes, and
  clickable assignment packets
- Character response: hover and keyboard focus shift the characters' gaze upward
  without drawing the old rectangular hotspot; keyboard focus remains visible
- Designer sprite: the purple beret was regenerated with an opaque interior;
  the office no longer shows through the hat
- Brand icon: `app/icon.png` and `app/apple-icon.png` show a cozy pixel office
  house with warm windows and a mint status light
- Live merge: the permanent demo roster remains the office skeleton; live events
  update matching agents by `id` or role while others remain `standby`
- Dynamic pool: eight permanent roles and eight assigned offices; a new `agentId`
  becomes a separate DOM node, while unknown or duplicate roles enter the digital
  annex and Team popover instead of standing between desks
- Profile builder: `ADD AGENT` accepts a custom name and specialty, offers eight
  reusable offices, eight avatars, and a data-driven runtime catalog; it accepts
  an arbitrary model ID, a reasoning dropdown, a safe endpoint, an
  environment-variable name, and a system prompt, stores at most 40 profiles in
  `localStorage` v2, and immediately adds them to the annex and Team roster
- Readability: scene labels use 12/9 px type, Team avatars are 58 × 66 px, the
  builder uses 14–15 px inputs, and a slight scene overscan removes dark source
  margins without changing the office composition
- Runtime catalog: `config/runtime-providers.json`; portable profile schema:
  `config/agent-profile.schema.json`; adapter contract:
  `docs/RUNTIME_ADAPTERS.md`
- Starter runtimes: Codex/OpenAI, Cursor, Claude Code, OpenAI-compatible, and a
  custom adapter; adding a provider card does not require a React change
- Demo assignments: `app/demo-state.json` and `public/demo-state.json`
- History: `.bureau/events.jsonl`
- Snapshot: `.bureau/state.json`
- Codex bridge: `.codex/config.toml` → `.codex/hooks/bureau-hook.sh` →
  `scripts/codex-hook.mjs`
- Skill source: `skills/agent-bureau`
- Cursor Researcher adapter: `skills/agent-bureau/scripts/cursor-researcher.mjs`
- Researcher profile: `Cursor Grok 4.5 High Fast`, reasoning `high`, Ask mode
- Cursor Agent CLI: `2026.07.23-e383d2b`; authentication confirmed
- Available canonical slug: `cursor-grok-4.5-high-fast`
- Actual smoke run: `docs/research/runtime-smoke.md`; verdict `approved`

## Event contract

```json
{
  "type": "task.started",
  "timestamp": "2026-07-31T13:00:00.000Z",
  "runId": "run-42",
  "agentId": "coder-1",
  "name": "Developer",
  "role": "coder",
  "taskId": "TASK-17",
  "task": "Add authentication",
  "status": "working",
  "model": "luna",
  "effort": "medium",
  "phase": "implementation",
  "summary": "Build middleware and tests",
  "progress": 54
}
```

## Task-assignment contract

The demo snapshot stores assignments separately from agents, allowing the
interface to show not only current activity but also the direction in which a
task was handed off:

```json
{
  "id": "assignment-ui-14",
  "taskId": "UI-14",
  "fromAgentId": "orchestrator",
  "toAgentId": "designer-1",
  "title": "Build the canonical pixel-office scene",
  "summary": "Use the exact public/og.png and add an interactive overlay.",
  "status": "working",
  "assignedAt": "2026-07-31T11:54:00.000Z",
  "updatedAt": "2026-07-31T12:00:00.000Z"
}
```

The target agent's `taskId` matches the assignment `taskId`. The collector keeps
at most 50 recent records, updates them by `assignmentId` or the
`taskId + agentId` pair, and removes prompts and transcripts before writing to
disk.

## Next logical steps

1. Connect native `bureauctl` events with explicit assignments, exact roles, a
   task graph, and verifier verdicts.
2. Implement trusted local runtime adapters against the open contract: exact
   model preflight, start/stop, and normalized telemetry.
3. Add heartbeat events for long-running agents.
4. Package the verified web UI in Tauri with autostart and a menu-bar icon.
5. If there is a real need, add an authenticated outbound-only, cloud read-only
   mirror instead of a demo feed on the public site.

## Known limitations

- Project hooks require trust through `/hooks` and apply to tasks in this
  repository.
- Tool hooks do not include `agent_id`; they appear as orchestrator activity.
- The live UI requires a running local process.
- The interior has a fixed composition: coordinates for eight offices and routes
  are tied to the `1672 × 941` aspect ratio. On narrow screens the full scene is
  scaled down, while overflow remains available in the digital annex and Team
  popover.
- The public Vercel deployment cannot read the user's `127.0.0.1` and always
  falls back to the safe demo snapshot.
- `CREATE AGENT` creates a local configuration and visual entity but does not
  start an LLM: the static page has no authorized runtime bridge and deliberately
  makes no claim otherwise.
- A runtime profile records user intent, not proof of execution. Actual provider,
  model, and reasoning values appear only in a confirmed live event from a local
  adapter; silent model substitution is forbidden.
- The browser stores only an environment-variable name. API keys, access tokens,
  and launch commands are not part of the JSON profile or catalog.
- `stale` appears after 45 seconds without a new event or heartbeat.
- A regular Codex spawn cannot grant itself an external Cursor/Grok profile. The
  Researcher starts through a separate CLI adapter, and its model is confirmed
  only after checking the initial `stream-json` event.
