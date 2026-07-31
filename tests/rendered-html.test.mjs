import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Agent Bureau office", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="en"/i);
  assert.match(html, /<title>Agent Bureau — Live Office<\/title>/i);
  assert.match(html, /rel="icon"[^>]+href="[^"]*\/icon\.png/i);
  assert.match(html, /rel="apple-touch-icon"[^>]+href="[^"]*\/apple-icon\.png/i);
  assert.match(html, /Agent Bureau/);
  assert.match(html, /LIVE OFFICE/);
  assert.match(html, /TASK ROUTES/);
  assert.match(html, /ORCHESTRATOR ASSIGNMENTS/);
  assert.match(html, /AGENT ROSTER/);
  assert.match(html, /Add agent/);
  assert.match(html, /TEAM(?:<!-- -->)? · (?:<!-- -->)?SIMULATED/);
  for (const agent of [
    "Orchestrator",
    "Developer",
    "Designer",
    "Researcher",
    "Verifier",
    "Copywriter",
    "Marketer",
    "Illustrator",
  ]) {
    assert.match(html, new RegExp(agent));
  }
  assert.doesNotMatch(html, /[А-Яа-яЁё]/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("removes starter-only preview code and metadata", async () => {
  const [css, page, layout, packageJson, runtimeCatalog, profileSchema] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../config/runtime-providers.json", import.meta.url), "utf8"),
    readFile(new URL("../config/agent-profile.schema.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /http:\/\/127\.0\.0\.1:7331\/api\/state/);
  assert.match(page, /targetAddressSpace:\s*"loopback"/);
  assert.match(page, /window\.location\.hostname/);
  assert.match(page, /if \(!isLocalOffice\)/);
  assert.match(page, /src="\/office-departments-v3\.png"/);
  assert.match(page, /ROLE_SPRITES/);
  assert.match(page, /"design",\s*"copy",\s*"marketing",\s*"image"/);
  assert.doesNotMatch(page, /HotDeskAgent|HOT_DESK_SPOTS/);
  assert.match(page, /TaskAssignment|task-packet/);
  assert.match(page, /ActivityKind|activityFor/);
  assert.match(page, /activity-effect|route-signal/);
  assert.match(page, /mobile-activity/);
  assert.match(page, /TEAM · \{usingDemo \? "SIMULATED"/);
  assert.match(page, /mergeLiveWithRoster/);
  assert.match(page, /presence:\s*"standby"/);
  assert.match(page, /agent\.presence !== "standby"/);
  assert.match(page, /AGENT_PROFILES_STORAGE_KEY/);
  assert.match(page, /LEGACY_CUSTOM_AGENTS_STORAGE_KEY/);
  assert.match(page, /OFFICE_TEMPLATES/);
  assert.match(page, /RUNTIME_PROVIDERS/);
  assert.match(page, /OpenAI-compatible|runtimeProvidersRaw/);
  assert.match(page, /Environment variable/);
  assert.match(page, /function AgentBuilder/);
  assert.match(page, /id="agent-name"/);
  assert.match(page, /id="agent-role"/);
  assert.match(page, /roleTitle:\s*customRole/);
  assert.match(page, /<select\s+id="runtime-reasoning"/);
  assert.match(page, /LOCAL CONNECTION REQUIRED/);
  assert.match(page, /provider\.setupHint/);
  assert.doesNotMatch(page, /datalist id="reasoning-suggestions"/);
  assert.match(page, /prompt stays in this browser/);
  assert.match(page, /teamOpen|team-popover|aria-expanded/);
  assert.match(page, /gaze-up-layer|GAZE_LAYOUTS/);
  for (const [sprite, dimensions] of Object.entries({
    orchestrator: [261, 303],
    researcher: [239, 306],
    reviewer: [249, 312],
    coder: [297, 316],
    designer: [249, 334],
    copywriter: [239, 319],
    marketing: [229, 315],
    image: [246, 321],
  })) {
    assert.match(
      page,
      new RegExp(`${sprite}: \\{ width: ${dimensions[0]}, height: ${dimensions[1]}, eyes:`),
    );
  }
  assert.match(page, /viewBox=\{`0 0 \$\{gaze\.width\} \$\{gaze\.height\}`\}/);
  assert.doesNotMatch(page, /OBSERVER|v0\.5|observer-hud|crew-dock|hotspot-aura|sprite-beacon/);
  const customAdapter = page.match(/function customDefinitionToAgent[\s\S]*?\n}\n\nfunction mergeLiveWithRoster/)?.[0] ?? "";
  assert.ok(customAdapter);
  assert.doesNotMatch(customAdapter, /definition\.systemPrompt/);
  assert.doesNotMatch(page, /apiKey\s*[:=]/i);
  assert.doesNotMatch(page, /PixelAgent|robot-head|OfficeRoom/);
  assert.match(css, /@keyframes agent-working/);
  assert.match(css, /@keyframes activity-pixel/);
  assert.match(css, /\.route-base/);
  assert.match(css, /\.route-signal/);
  assert.match(css, /\.activity-using-tool/);
  assert.match(css, /\.mobile-activity/);
  assert.match(css, /\.task-packet-done,[\s\S]*?\.task-packet-blocked,[\s\S]*?\.task-packet-stale \{ animation: none; \}/);
  assert.match(css, /@keyframes agent-arrive/);
  assert.match(css, /@keyframes team-popover-enter/);
  assert.match(css, /\.gaze-up-layer/);
  assert.match(css, /\.agent-label-head strong \{[^}]*font-size: 12px/);
  assert.match(css, /\.team-avatar \{[^}]*width: 58px; height: 66px/);
  assert.match(css, /\.identity-fields \{[^}]*grid-template-columns: 1fr 1fr/);
  assert.match(css, /\.builder-close span::before/);
  assert.doesNotMatch(css, /\.observer-hud|\.crew-dock|\.hotspot-aura|\.sprite-beacon/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(layout, /Agent Bureau — Live Office/);
  assert.match(layout, /lang="en"/);
  assert.doesNotMatch(runtimeCatalog, /[А-Яа-яЁё]/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(page, /codex-preview|SkeletonPreview/);
  assert.doesNotMatch(layout, /codex-preview|_sites-preview/);
  assert.equal(JSON.parse(runtimeCatalog).length, 5);
  assert.equal(JSON.parse(profileSchema).properties.runtime.$ref, "#/$defs/runtime");

  await assert.rejects(
    access(new URL("app/_sites-preview", templateRoot)),
  );
  await Promise.all([
    access(new URL("../public/office-departments-v3.png", import.meta.url)),
    access(new URL("../public/agents/orchestrator.png", import.meta.url)),
    access(new URL("../public/agents/researcher.png", import.meta.url)),
    access(new URL("../public/agents/coder.png", import.meta.url)),
    access(new URL("../public/agents/reviewer.png", import.meta.url)),
    access(new URL("../public/agents/designer.png", import.meta.url)),
    access(new URL("../public/agents/copywriter.png", import.meta.url)),
    access(new URL("../public/agents/marketing.png", import.meta.url)),
    access(new URL("../public/agents/image.png", import.meta.url)),
    access(new URL("../app/icon.png", import.meta.url)),
    access(new URL("../app/apple-icon.png", import.meta.url)),
    access(new URL("../public/offices/orchestrator.webp", import.meta.url)),
    access(new URL("../public/offices/researcher.webp", import.meta.url)),
    access(new URL("../public/offices/reviewer.webp", import.meta.url)),
    access(new URL("../public/offices/coder.webp", import.meta.url)),
    access(new URL("../public/offices/designer.webp", import.meta.url)),
    access(new URL("../public/offices/copywriter.webp", import.meta.url)),
    access(new URL("../public/offices/marketing.webp", import.meta.url)),
    access(new URL("../public/offices/image.webp", import.meta.url)),
  ]);
});
