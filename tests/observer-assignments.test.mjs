import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const observer = fileURLToPath(new URL("../scripts/observer.mjs", import.meta.url));

test("collector tracks, sanitizes, and bounds real task assignments", async (context) => {
  const dataDir = await mkdtemp(join(tmpdir(), "bureau-observer-"));
  const port = await reservePort();
  const endpoint = `http://${HOST}:${port}`;
  const child = spawn(process.execPath, [observer], {
    env: {
      ...process.env,
      BUREAU_OBSERVER_DATA_DIR: dataDir,
      BUREAU_OBSERVER_PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const closed = new Promise((resolvePromise) => child.once("close", resolvePromise));

  context.after(async () => {
    if (child.exitCode === null) child.kill("SIGTERM");
    await closed;
    await rm(dataDir, { recursive: true, force: true });
  });

  await waitForHealth(endpoint, child, () => stderr);

  await postEvent(endpoint, {
    type: "task.assigned",
    assignmentId: "assignment-alpha",
    taskId: "task-alpha",
    fromAgentId: "orchestrator",
    toAgentId: "coder-1",
    title: "Build the API Bearer super-secret-token",
    summary: "Use /Users/example/private/plan.md",
    prompt: "must never be retained",
    transcript: "must never be retained either",
  });

  let state = await getState(endpoint);
  assert.equal(state.assignments.length, 1);
  assert.deepEqual(
    Object.keys(state.assignments[0]).sort(),
    [
      "assignedAt",
      "fromAgentId",
      "id",
      "status",
      "summary",
      "taskId",
      "title",
      "toAgentId",
      "updatedAt",
    ],
  );
  assert.equal(state.assignments[0].id, "assignment-alpha");
  assert.equal(state.assignments[0].toAgentId, "coder-1");
  assert.equal(state.assignments[0].status, "assigned");
  assert.doesNotMatch(JSON.stringify(state), /super-secret-token|must never be retained/);
  assert.match(state.assignments[0].summary, /\[path redacted\]/);
  assert.equal(state.agents[0].id, "coder-1");

  await postEvent(endpoint, {
    type: "task.started",
    assignmentId: "assignment-alpha",
    agentId: "coder-1",
  });
  state = await getState(endpoint);
  assert.equal(state.assignments[0].status, "working");

  await postEvent(endpoint, {
    type: "review.started",
    assignmentId: "assignment-alpha",
    agentId: "reviewer-1",
  });
  state = await getState(endpoint);
  assert.equal(state.assignments[0].status, "reviewing");

  await postEvent(endpoint, {
    type: "review.revision_requested",
    assignmentId: "assignment-alpha",
    agentId: "reviewer-1",
  });
  state = await getState(endpoint);
  assert.equal(state.assignments[0].status, "revision");

  await postEvent(endpoint, {
    type: "task.completed",
    taskId: "task-alpha",
    agentId: "coder-1",
  });
  state = await getState(endpoint);
  assert.equal(state.assignments[0].status, "done");

  for (let index = 0; index < 51; index += 1) {
    await postEvent(endpoint, {
      type: "task.assigned",
      taskId: `bulk-${index}`,
      agentId: `agent-${index}`,
      task: `Task ${index}`,
    });
  }

  state = await getState(endpoint);
  assert.equal(state.assignments.length, 50);
  assert.equal(state.assignments.at(-1).id, "bulk-50:agent-50");
  assert.ok(!state.assignments.some((assignment) => assignment.id === "assignment-alpha"));

  const persisted = JSON.parse(await readFile(join(dataDir, "state.json"), "utf8"));
  assert.equal(persisted.assignments.length, 50);
  const eventLog = await readFile(join(dataDir, "events.jsonl"), "utf8");
  assert.doesNotMatch(eventLog, /super-secret-token|must never be retained/);
});

async function reservePort() {
  const server = createServer();
  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, HOST, resolvePromise);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  return port;
}

async function waitForHealth(endpoint, child, readStderr) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `observer exited early with code ${child.exitCode}: ${readStderr().trim()}`,
      );
    }
    try {
      const response = await fetch(`${endpoint}/api/health`);
      if (response.ok) return;
    } catch {
      // The child may still be binding its local socket.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  throw new Error("observer did not become healthy in time");
}

async function postEvent(endpoint, event) {
  const response = await fetch(`${endpoint}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  assert.equal(response.status, 202, await response.text());
}

async function getState(endpoint) {
  const response = await fetch(`${endpoint}/api/state`);
  assert.equal(response.status, 200);
  return response.json();
}
