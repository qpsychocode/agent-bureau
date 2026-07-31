import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const adapter = fileURLToPath(new URL("../skills/agent-bureau/scripts/cursor-researcher.mjs", import.meta.url));
const fakeAgent = fileURLToPath(new URL("./fixtures/fake-cursor-agent.mjs", import.meta.url));

test.before(async () => chmod(fakeAgent, 0o755));

test("preflight confirms the exact Cursor Grok profile", async () => {
  const result = await run(["--check"]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /cursor-grok-4\.5-high-fast/);
});

test("research run attests the model and writes a Markdown report", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "bureau-research-"));
  const result = await run([
    "--cwd",
    cwd,
    "--task-id",
    "profile-check",
    "--task",
    "Verify the Grok 4.5 profile",
  ]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Cursor Grok 4\.5 High Fast/);
  const report = await readFile(join(cwd, "docs", "research", "profile-check.md"), "utf8");
  assert.match(report, /Requested Cursor slug: cursor-grok-4\.5-high-fast/);
  assert.match(report, /Actual model: Cursor Grok 4\.5 High Fast/);
  assert.match(report, /Profile confirmed/);
  assert.doesNotMatch(report, /Checking sources/);
});

test("research run rejects a silent model substitution", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "bureau-research-"));
  const result = await run(
    ["--cwd", cwd, "--task-id", "wrong-model", "--task", "Verify the profile"],
    { FAKE_CURSOR_MODEL: "Auto" },
  );

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /instead of Cursor Grok 4\.5 Fast/);
});

test("research run stops after the hard tool-call budget", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "bureau-research-"));
  const result = await run(
    ["--cwd", cwd, "--task-id", "tool-budget", "--task", "Verify the sources"],
    {
      BUREAU_RESEARCH_MAX_TOOL_CALLS: "4",
      FAKE_TOOL_CALLS: "5",
    },
  );

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /stopped after 4 tool calls/);
});

function run(args, extraEnv = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [adapter, ...args], {
      cwd: projectRoot,
      env: {
        ...process.env,
        ...extraEnv,
        PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH || ""}`,
        CURSOR_AGENT_BIN: fakeAgent,
        BUREAU_OBSERVER_ENDPOINT: "http://127.0.0.1:1/api/events",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectPromise);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}
