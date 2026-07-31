#!/usr/bin/env node

const args = process.argv.slice(2);
const model = process.env.FAKE_CURSOR_MODEL || "Cursor Grok 4.5 High Fast";
const toolCalls = Number.parseInt(process.env.FAKE_TOOL_CALLS || "1", 10);

if (args.includes("--list-models") || args[0] === "models") {
  process.stdout.write("cursor-grok-4.5-high-fast - Cursor Grok 4.5 Fast\n");
  process.exit(0);
}

process.stdout.write(`${JSON.stringify({
  type: "system",
  subtype: "init",
  model,
  session_id: "fake-session",
})}\n`);
for (let index = 0; index < toolCalls; index += 1) {
  process.stdout.write(`${JSON.stringify({
    type: "tool_call",
    subtype: "started",
    session_id: "fake-session",
  })}\n`);
}
process.stdout.write(`${JSON.stringify({
  type: "result",
  subtype: "success",
  result: "Проверяю источники.\n## Короткий ответ\n\nПрофиль подтверждён.\n\n## Источники\n\n- https://cursor.com/grok",
  session_id: "fake-session",
})}\n`);
