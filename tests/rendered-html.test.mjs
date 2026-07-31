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
  assert.match(html, /<title>Агентское бюро — живой офис<\/title>/i);
  assert.match(html, /Агентское бюро/);
  assert.match(html, /ЖИВОЙ ОФИС/);
  assert.match(html, /МАРШРУТЫ ЗАДАЧ/);
  assert.match(html, /НАЗНАЧЕНИЕ ОТ ОРКЕСТРАТОРА/);
  assert.match(html, /ПУЛ АГЕНТОВ/);
  for (const agent of [
    "Оркестратор",
    "Кодер",
    "Дизайнер",
    "Ресерчер",
    "Верификатор",
    "Копирайтер",
    "Маркетолог",
    "Иллюстратор",
  ]) {
    assert.match(html, new RegExp(agent));
  }
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("removes starter-only preview code and metadata", async () => {
  const [css, page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /http:\/\/127\.0\.0\.1:7331\/api\/state/);
  assert.match(page, /src="\/office-departments-v3\.png"/);
  assert.match(page, /ROLE_SPRITES/);
  assert.match(page, /"design",\s*"copy",\s*"marketing",\s*"image"/);
  assert.doesNotMatch(page, /HotDeskAgent|HOT_DESK_SPOTS/);
  assert.match(page, /TaskAssignment|task-packet/);
  assert.match(page, /mergeLiveWithRoster/);
  assert.match(page, /presence:\s*"standby"/);
  assert.match(page, /agent\.presence !== "standby"/);
  assert.doesNotMatch(page, /PixelAgent|robot-head|OfficeRoom/);
  assert.match(css, /@keyframes agent-working/);
  assert.match(css, /@keyframes agent-arrive/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(layout, /Агентское бюро — живой офис/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(page, /codex-preview|SkeletonPreview/);
  assert.doesNotMatch(layout, /codex-preview|_sites-preview/);

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
  ]);
});
