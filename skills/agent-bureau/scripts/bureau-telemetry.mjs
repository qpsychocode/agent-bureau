#!/usr/bin/env node

import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { join, resolve } from "node:path";

class CliError extends Error {}

const EVENT_TYPES = new Set([
  "run.started",
  "run.finished",
  "heartbeat",
  "agent.registered",
  "agent.spawned",
  "agent.started",
  "agent.status",
  "agent.idle",
  "agent.blocked",
  "agent.done",
  "agent.stopped",
  "task.assigned",
  "task.started",
  "task.blocked",
  "task.completed",
  "decision.recorded",
  "tool.started",
  "tool.finished",
  "artifact.submitted",
  "review.started",
  "review.approved",
  "review.revision_requested",
]);

const IDENTIFIER_FIELDS = new Set([
  "id",
  "runId",
  "agentId",
  "assignmentId",
  "taskId",
  "fromAgentId",
  "toAgentId",
  "model",
]);
const DISPLAY_LIMITS = new Map([
  ["project", 120],
  ["name", 80],
  ["role", 80],
  ["title", 240],
  ["task", 240],
  ["phase", 80],
  ["summary", 320],
]);
const KEY_ALIASES = new Map([
  ["run-id", "runId"],
  ["agent-id", "agentId"],
  ["assignment-id", "assignmentId"],
  ["task-id", "taskId"],
  ["from-agent-id", "fromAgentId"],
  ["to-agent-id", "toAgentId"],
]);

const workspaceDir = process.env.BUREAU_WORKSPACE
  ? resolve(process.env.BUREAU_WORKSPACE)
  : process.cwd();
const observerBase = (process.env.BUREAU_OBSERVER_URL || "http://127.0.0.1:7331")
  .replace(/\/+$/, "");
const observerEndpoint = `${observerBase}/api/events`;
const healthEndpoint = `${observerBase}/api/health`;

try {
  const [command, ...rawArgs] = process.argv.slice(2);
  if (command === "--help" || command === "help" || !command) {
    process.stdout.write(helpText());
  } else if (command !== "emit") {
    throw new CliError(`Unknown command: ${command}`);
  } else {
    const event = parseEvent(rawArgs);
    await publish(event);
    process.stdout.write(`${JSON.stringify({ accepted: true, type: event.type, agentId: event.agentId })}\n`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "telemetry_failed";
  process.stderr.write(`[bureauctl] ${message}\n`);
  process.exitCode = 1;
}

// A short-lived CLI should not wait for an HTTP keep-alive socket to expire.
process.exit(process.exitCode || 0);

function parseEvent(args) {
  const raw = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) throw new CliError(`Unexpected argument: ${token}`);
    const key = KEY_ALIASES.get(token.slice(2)) || token.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new CliError(`Missing value for ${token}`);
    raw[key] = value;
    index += 1;
  }

  if (!EVENT_TYPES.has(raw.type)) throw new CliError("--type must be a supported Bureau event");

  const event = { type: raw.type, timestamp: new Date().toISOString() };
  for (const [key, value] of Object.entries(raw)) {
    if (key === "type") continue;
    if (IDENTIFIER_FIELDS.has(key)) {
      const clean = identifier(value);
      if (clean) event[key] = clean;
      continue;
    }
    if (DISPLAY_LIMITS.has(key)) {
      const clean = displayText(value, DISPLAY_LIMITS.get(key));
      if (clean) event[key] = clean;
      continue;
    }
    if (key === "progress") {
      const progress = Number(value);
      if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
        throw new CliError("--progress must be between 0 and 100");
      }
      event.progress = Math.round(progress);
      continue;
    }
    if (key === "status" || key === "effort") {
      event[key] = identifier(value);
      continue;
    }
    throw new CliError(`Unsupported field: --${key}`);
  }

  if (!event.agentId && !event.type.startsWith("run.")) {
    event.agentId = event.toAgentId || "orchestrator";
  }
  return event;
}

async function publish(event) {
  try {
    await postEvent(event, 450);
    return;
  } catch {
    if (!(await ensureLocalObserver())) throw new CliError("observer unavailable");
  }
  await postEvent(event, 800);
}

async function postEvent(event, timeoutMs) {
  const response = await fetch(observerEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`observer_http_${response.status}`);
}

async function ensureLocalObserver() {
  const url = new URL(observerBase);
  if (!new Set(["127.0.0.1", "localhost"]).has(url.hostname)) return false;
  if (await healthy(180)) return true;

  const observerScript = join(workspaceDir, "scripts", "observer.mjs");
  if (!existsSync(observerScript)) return false;
  const dataDir = join(workspaceDir, ".bureau");
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const logFd = openSync(join(dataDir, "observer.log"), "a", 0o600);
  try {
    const child = spawn(process.execPath, [observerScript], {
      cwd: workspaceDir,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: process.env,
    });
    child.unref();
  } finally {
    closeSync(logFd);
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 80));
    if (await healthy(160)) return true;
  }
  return false;
}

async function healthy(timeoutMs) {
  try {
    const response = await fetch(healthEndpoint, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function identifier(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9._:@-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || undefined;
}

function displayText(value, limit) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit) || undefined;
}

function helpText() {
  return `Agent Bureau telemetry\n\nUsage:\n  bureauctl emit --type task.started --agent-id coder --task-id TASK-001 --task "Safe task title" --phase implementation --progress 40\n\nOnly send concise activity summaries. Never send prompts, transcripts, tool arguments, file contents, secrets, or hidden reasoning.\n`;
}
