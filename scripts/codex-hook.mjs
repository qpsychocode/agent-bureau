import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OBSERVER_ENDPOINT = "http://127.0.0.1:7331/api/events";
const OBSERVER_HEALTH_ENDPOINT = "http://127.0.0.1:7331/api/health";
const MAX_HOOK_PAYLOAD_BYTES = 256 * 1024;
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_DIR = dirname(SCRIPT_DIR);
const OBSERVER_SCRIPT = join(SCRIPT_DIR, "observer.mjs");
const BUREAU_DATA_DIR = join(WORKSPACE_DIR, ".bureau");

let shouldContinue = false;

try {
  const payload = await readHookPayload();
  shouldContinue = isStopHook(payload);
  const event = toBureauEvent(payload);
  if (event) await publish(event);
} catch (error) {
  // Telemetry must never block or change the outcome of a Codex hook.
  if (process.env.BUREAU_HOOK_DEBUG === "1") {
    console.error(`[bureau-hook] Event skipped: ${safeErrorName(error)}`);
  }
} finally {
  if (shouldContinue) process.stdout.write('{"continue":true}\n');
}

async function readHookPayload() {
  const chunks = [];
  let size = 0;

  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_HOOK_PAYLOAD_BYTES) {
      throw new Error("payload_too_large");
    }
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) throw new Error("empty_payload");
  return JSON.parse(text);
}

function toBureauEvent(payload) {
  if (!isPlainObject(payload)) return null;

  const hookName = firstText(
    payload.hook_event_name,
    payload.hookEventName,
    payload.event_name,
    payload.eventName,
    payload.event,
  );
  const normalizedHook = hookName?.replace(/[^a-zA-Z]/g, "").toLowerCase();
  const agentId = safeIdentifier(firstText(
    payload.agent_id,
    payload.agentId,
    payload.subagent_id,
    payload.subagentId,
  )) || "orchestrator";
  const role = safeLabel(firstText(payload.agent_type, payload.agentType))
    || (agentId === "orchestrator" ? "orchestrator" : "agent");
  const runId = safeIdentifier(firstText(payload.session_id, payload.sessionId));
  const model = safeIdentifier(firstText(payload.model));
  const toolName = safeIdentifier(firstText(payload.tool_name, payload.toolName));

  const base = {
    timestamp: new Date().toISOString(),
    runId,
    agentId,
    name: agentId === "orchestrator" ? "Orchestrator" : undefined,
    role,
    model,
  };

  switch (normalizedHook) {
    case "sessionstart":
      return {
        ...base,
        type: "run.started",
        summary: "Bureau session started",
      };
    case "subagentstart":
      return {
        ...base,
        type: "agent.spawned",
        summary: `${role} agent started working`,
      };
    case "subagentstop":
      return {
        ...base,
        type: "agent.done",
        summary: `${role} agent finished working`,
      };
    case "userpromptsubmit":
      return {
        ...base,
        type: "task.started",
        summary: "The orchestrator is reviewing a new task",
      };
    case "pretooluse":
      return {
        ...base,
        type: "tool.started",
        phase: toolName ? `tool:${toolName}` : "tool",
        summary: toolName
          ? `Using tool ${toolName}`
          : "Using a tool",
      };
    case "posttooluse":
      return {
        ...base,
        type: "tool.finished",
        phase: toolName ? `tool:${toolName}` : "tool",
        summary: toolName
          ? `Finished using tool ${toolName}`
          : "Finished using a tool",
      };
    case "posttoolusefailure":
      return {
        ...base,
        type: "tool.finished",
        phase: toolName ? `tool:${toolName}` : "tool",
        summary: toolName
          ? `Tool ${toolName} failed`
          : "Tool failed",
      };
    case "permissionrequest":
      return {
        ...base,
        type: "agent.blocked",
        summary: "Waiting for user approval",
      };
    case "taskcompleted":
      return {
        ...base,
        type: "task.completed",
        summary: "Task completed",
      };
    case "stop":
      return {
        ...base,
        type: agentId === "orchestrator" ? "task.completed" : "agent.done",
        summary: agentId === "orchestrator"
          ? "The orchestrator finished its work cycle"
          : "Agent finished working",
      };
    case "sessionend":
      return {
        ...base,
        type: "run.finished",
        summary: "Bureau session ended",
      };
    case "notification":
      return {
        ...base,
        type: "heartbeat",
      };
    default:
      return null;
  }
}

function isStopHook(payload) {
  if (!isPlainObject(payload)) return false;
  const hookName = firstText(
    payload.hook_event_name,
    payload.hookEventName,
    payload.event_name,
    payload.eventName,
    payload.event,
  );
  const normalized = hookName?.replace(/[^a-zA-Z]/g, "").toLowerCase();
  return normalized === "stop" || normalized === "subagentstop";
}

async function publish(event) {
  try {
    await postEvent(event, 280);
    return;
  } catch {
    const started = await ensureObserver();
    if (!started) throw new Error("observer_unavailable");
  }

  await postEvent(event, 420);
}

async function postEvent(event, timeoutMs) {
  const response = await fetch(OBSERVER_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) throw new Error(`observer_http_${response.status}`);
}

async function ensureObserver() {
  if (await observerIsHealthy(140)) return true;
  if (!existsSync(OBSERVER_SCRIPT)) return false;

  mkdirSync(BUREAU_DATA_DIR, { recursive: true, mode: 0o700 });
  const logPath = join(BUREAU_DATA_DIR, "observer.log");
  const logFd = openSync(logPath, "a", 0o600);
  try {
    const child = spawn(process.execPath, [OBSERVER_SCRIPT], {
      cwd: WORKSPACE_DIR,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: process.env,
    });
    child.unref();
  } finally {
    closeSync(logFd);
  }

  for (let attempt = 0; attempt < 7; attempt += 1) {
    await wait(70);
    if (await observerIsHealthy(110)) return true;
  }
  return false;
}

async function observerIsHealthy(timeoutMs) {
  try {
    const response = await fetch(OBSERVER_HEALTH_ENDPOINT, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function firstText(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim();
}

function safeIdentifier(value) {
  if (typeof value !== "string") return undefined;
  return value
    .replace(/[^a-zA-Z0-9._:@-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || undefined;
}

function safeLabel(value) {
  if (typeof value !== "string") return undefined;
  return value
    .replace(/[^a-zA-Z0-9 _.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || undefined;
}

function safeErrorName(error) {
  if (!(error instanceof Error)) return "unknown_error";
  return safeIdentifier(error.message) || error.name || "unknown_error";
}

function isPlainObject(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}
