import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, appendFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const PORT = positiveInteger(process.env.BUREAU_OBSERVER_PORT, 7331);
const MAX_BODY_BYTES = 32 * 1024;
const DEFAULT_STALE_AFTER_MS = 180_000;
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_DIR = dirname(SCRIPT_DIR);
const DATA_DIR = process.env.BUREAU_OBSERVER_DATA_DIR
  ? resolve(process.env.BUREAU_OBSERVER_DATA_DIR)
  : join(WORKSPACE_DIR, ".bureau");
const EVENTS_FILE = join(DATA_DIR, "events.jsonl");
const STATE_FILE = join(DATA_DIR, "state.json");
const STATE_TEMP_FILE = join(DATA_DIR, `.state.${process.pid}.tmp`);
const STALE_AFTER_MS = positiveInteger(
  process.env.BUREAU_STALE_AFTER_MS,
  DEFAULT_STALE_AFTER_MS,
);
const READ_ONLY_WEB_ORIGINS = new Set([
  "https://agent-bureau.vercel.app",
  ...(process.env.BUREAU_READ_ONLY_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
]);

const STATUSES = new Set([
  "idle",
  "planning",
  "working",
  "reviewing",
  "revision",
  "blocked",
  "done",
]);

const ACTIVE_STATUSES = new Set([
  "planning",
  "working",
  "reviewing",
  "revision",
  "blocked",
]);

const ASSIGNMENT_STATUSES = new Set([
  "assigned",
  "working",
  "reviewing",
  "revision",
  "done",
  "blocked",
]);

const MAX_ASSIGNMENTS = 50;

const EVENT_STATUS = new Map([
  ["agent.registered", "idle"],
  ["agent.spawned", "planning"],
  ["agent.started", "planning"],
  ["agent.idle", "idle"],
  ["task.assigned", "planning"],
  ["task.started", "working"],
  ["tool.started", "working"],
  ["artifact.submitted", "reviewing"],
  ["review.started", "reviewing"],
  ["review.approved", "done"],
  ["review.revision_requested", "revision"],
  ["agent.blocked", "blocked"],
  ["task.blocked", "blocked"],
  ["task.completed", "done"],
  ["agent.done", "done"],
  ["agent.stopped", "done"],
]);

const EVENT_ASSIGNMENT_STATUS = new Map([
  ["task.assigned", "assigned"],
  ["agent.started", "working"],
  ["task.started", "working"],
  ["tool.started", "working"],
  ["artifact.submitted", "reviewing"],
  ["review.started", "reviewing"],
  ["review.approved", "done"],
  ["review.revision_requested", "revision"],
  ["agent.blocked", "blocked"],
  ["task.blocked", "blocked"],
  ["task.completed", "done"],
  ["agent.done", "done"],
  ["agent.stopped", "done"],
]);

const TOOL_CLEARING_EVENTS = new Set([
  "tool.finished",
  "artifact.submitted",
  "review.started",
  "review.approved",
  "review.revision_requested",
  "agent.blocked",
  "task.blocked",
  "task.completed",
  "agent.done",
  "agent.stopped",
]);

const ALLOWED_EFFORTS = new Set([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
]);

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

const DEFAULT_PROJECT = sanitizeDisplayText(
  process.env.AGENT_BUREAU_PROJECT || basename(WORKSPACE_DIR),
  120,
) || "Agent Bureau";

let state = createInitialState();
let persistenceQueue = Promise.resolve();
const startedAt = Date.now();

await initializeStorage();

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  const corsAccess = allowedBrowserOrigin(origin);

  if (origin && !corsAccess) {
    sendJson(response, 403, { error: "origin_not_allowed" });
    return;
  }

  if (corsAccess) {
    response.setHeader("Access-Control-Allow-Origin", corsAccess.origin);
    response.setHeader("Vary", "Origin");
    if (request.headers["access-control-request-private-network"] === "true") {
      response.setHeader("Access-Control-Allow-Private-Network", "true");
    }
  }

  if (corsAccess?.readOnly && request.method !== "GET" && request.method !== "OPTIONS") {
    sendJson(response, 403, { error: "origin_is_read_only" });
    return;
  }

  if (request.method === "OPTIONS") {
    response.setHeader(
      "Access-Control-Allow-Methods",
      corsAccess?.readOnly ? "GET, OPTIONS" : "GET, POST, OPTIONS",
    );
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Max-Age", "600");
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);

  if (request.method === "GET" && url.pathname === "/api/state") {
    sendJson(response, 200, stateForResponse());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    const responseState = stateForResponse();
    sendJson(response, 200, {
      ok: true,
      service: "agent-bureau-observer",
      host: HOST,
      port: PORT,
      updatedAt: responseState.updatedAt,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      agents: responseState.agents.length,
      staleAgents: responseState.agents.filter((agent) => agent.stale).length,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/events") {
    if (!isJsonContentType(request.headers["content-type"])) {
      sendJson(response, 415, { error: "content_type_must_be_application_json" });
      return;
    }

    try {
      const rawEvent = await readJsonBody(request);
      const event = sanitizeEvent(rawEvent);
      await enqueuePersistence(async () => {
        const nextState = reduceEvent(state, event);
        await appendFile(EVENTS_FILE, `${JSON.stringify(event)}\n`, {
          encoding: "utf8",
          mode: 0o600,
        });
        await persistSnapshot(nextState);
        state = nextState;
      });

      sendJson(response, 202, {
        accepted: true,
        eventId: event.id,
        updatedAt: state.updatedAt,
      });
    } catch (error) {
      const status = error instanceof RequestError ? error.status : 500;
      const message = error instanceof RequestError
        ? error.message
        : "event_persistence_failed";
      if (status === 500) {
        console.error("[observer] Could not persist a sanitized event.");
      }
      sendJson(response, status, { error: message });
    }
    return;
  }

  sendJson(response, 404, { error: "not_found" });
});

server.on("clientError", (_error, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
});

server.on("error", (error) => {
  console.error(`[observer] ${error.message}`);
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`[observer] Pixel office telemetry: http://${HOST}:${PORT}`);
});

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  await new Promise((resolve) => server.close(resolve));
  await persistenceQueue.catch(() => undefined);
  console.log(`[observer] Stopped (${signal}).`);
}

async function initializeStorage() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    const persisted = JSON.parse(await readFile(STATE_FILE, "utf8"));
    state = sanitizePersistedState(persisted);
  } catch (error) {
    if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) {
      throw error;
    }
    await persistSnapshot(state);
  }
}

function createInitialState() {
  return {
    version: 1,
    project: DEFAULT_PROJECT,
    runId: null,
    mode: "live",
    updatedAt: new Date().toISOString(),
    agents: [],
    assignments: [],
  };
}

function sanitizePersistedState(value) {
  if (!isPlainObject(value)) return createInitialState();

  const agents = Array.isArray(value.agents)
    ? value.agents
      .slice(0, 200)
      .map(sanitizePersistedAgent)
      .filter(Boolean)
    : [];

  const assignments = Array.isArray(value.assignments)
    ? value.assignments
      .slice(-MAX_ASSIGNMENTS)
      .map(sanitizePersistedAssignment)
      .filter(Boolean)
    : [];

  return {
    version: 1,
    project: sanitizeDisplayText(value.project, 120) || DEFAULT_PROJECT,
    runId: sanitizeIdentifier(value.runId, 96) || null,
    mode: "live",
    updatedAt: sanitizeTimestamp(value.updatedAt) || new Date().toISOString(),
    agents,
    assignments,
  };
}

function sanitizePersistedAgent(value) {
  if (!isPlainObject(value)) return null;
  const id = sanitizeIdentifier(value.id, 96);
  if (!id) return null;

  const status = STATUSES.has(value.status) ? value.status : "idle";
  return compactObject({
    id,
    name: sanitizeDisplayText(value.name, 80) || humanizeIdentifier(id),
    role: sanitizeDisplayText(value.role, 80) || "agent",
    status,
    taskId: sanitizeIdentifier(value.taskId, 96),
    task: sanitizeDisplayText(value.task, 240),
    model: sanitizeIdentifier(value.model, 80),
    effort: ALLOWED_EFFORTS.has(value.effort) ? value.effort : undefined,
    phase: sanitizeDisplayText(value.phase, 80),
    activityEvent: EVENT_TYPES.has(value.activityEvent) ? value.activityEvent : undefined,
    activeTool: sanitizeIdentifier(value.activeTool, 80),
    summary: sanitizeDisplayText(value.summary, 320),
    startedAt: sanitizeTimestamp(value.startedAt),
    completedAt: sanitizeTimestamp(value.completedAt),
    updatedAt: sanitizeTimestamp(value.updatedAt) || new Date().toISOString(),
    lastSeenAt: sanitizeTimestamp(value.lastSeenAt) || new Date().toISOString(),
    review: sanitizeReview(value.review),
  });
}

function sanitizePersistedAssignment(value) {
  if (!isPlainObject(value)) return null;

  const taskId = sanitizeIdentifier(value.taskId ?? value.task_id, 96);
  const toAgentId = sanitizeIdentifier(
    value.toAgentId ?? value.to_agent_id ?? value.agentId ?? value.agent_id,
    96,
  );
  const id = sanitizeIdentifier(
    value.id ?? value.assignmentId ?? value.assignment_id,
    192,
  ) || assignmentFallbackId(taskId, toAgentId);
  if (!id || !toAgentId) return null;

  const updatedAt = sanitizeTimestamp(value.updatedAt ?? value.updated_at)
    || new Date().toISOString();
  const title = sanitizeDisplayText(value.title ?? value.task, 240)
    || humanizeIdentifier(taskId || id);

  return compactObject({
    id,
    taskId,
    fromAgentId: sanitizeIdentifier(
      value.fromAgentId ?? value.from_agent_id,
      96,
    ),
    toAgentId,
    title,
    summary: sanitizeDisplayText(value.summary, 320),
    status: sanitizeAssignmentStatus(value.status) || "assigned",
    assignedAt: sanitizeTimestamp(value.assignedAt ?? value.assigned_at) || updatedAt,
    updatedAt,
  });
}

function sanitizeEvent(value) {
  if (!isPlainObject(value)) {
    throw new RequestError(400, "event_must_be_an_object");
  }

  const type = normalizeEventType(value.type ?? value.eventType ?? value.event_type);
  if (!EVENT_TYPES.has(type)) {
    throw new RequestError(400, "unsupported_event_type");
  }

  const receivedAt = new Date().toISOString();
  const event = compactObject({
    id: sanitizeIdentifier(value.id ?? value.eventId ?? value.event_id, 96) || randomUUID(),
    type,
    timestamp: sanitizeTimestamp(value.timestamp) || receivedAt,
    receivedAt,
    project: sanitizeDisplayText(value.project ?? value.projectId ?? value.project_id, 120),
    runId: sanitizeIdentifier(value.runId ?? value.run_id, 96),
    agentId: sanitizeIdentifier(value.agentId ?? value.agent_id, 96),
    name: sanitizeDisplayText(value.name ?? value.agentName ?? value.agent_name, 80),
    role: sanitizeDisplayText(value.role, 80),
    assignmentId: sanitizeIdentifier(
      value.assignmentId ?? value.assignment_id,
      192,
    ),
    taskId: sanitizeIdentifier(value.taskId ?? value.task_id, 96),
    fromAgentId: sanitizeIdentifier(
      value.fromAgentId ?? value.from_agent_id,
      96,
    ),
    toAgentId: sanitizeIdentifier(
      value.toAgentId ?? value.to_agent_id,
      96,
    ),
    title: sanitizeDisplayText(value.title, 240),
    task: sanitizeDisplayText(value.task, 240),
    status: sanitizeStatus(value.status),
    assignmentStatus: sanitizeAssignmentStatus(value.status),
    model: sanitizeIdentifier(value.model, 80),
    effort: sanitizeEffort(value.effort),
    phase: sanitizeDisplayText(value.phase, 80),
    summary: sanitizeDisplayText(value.summary, 320),
    progress: sanitizeProgress(value.progress),
    review: sanitizeReview(value.review),
  });

  if (!event.agentId && !type.startsWith("run.")) {
    event.agentId = event.toAgentId || "orchestrator";
  }

  return Object.freeze(event);
}

function reduceEvent(currentState, event) {
  const receivedAt = event.receivedAt;
  let agents = currentState.agents.map((agent) => ({ ...agent }));
  let assignments = Array.isArray(currentState.assignments)
    ? currentState.assignments.map((assignment) => ({ ...assignment }))
    : [];
  let runId = event.runId || currentState.runId;
  let project = event.project || currentState.project;

  if (event.type === "run.started") {
    const nextRunId = event.runId || randomUUID();
    if (currentState.runId !== nextRunId) {
      agents = [];
      assignments = [];
    }
    runId = nextRunId;
  }

  if (event.type === "run.finished") {
    agents = agents.map((agent) => {
      if (!ACTIVE_STATUSES.has(agent.status)) return agent;
      return {
        ...agent,
        status: "done",
        completedAt: receivedAt,
        updatedAt: receivedAt,
        lastSeenAt: receivedAt,
      };
    });
    assignments = assignments.map((assignment) => {
      if (assignment.status === "done" || assignment.status === "blocked") {
        return assignment;
      }
      return {
        ...assignment,
        status: "done",
        updatedAt: receivedAt,
      };
    });
  }

  assignments = reduceAssignments(assignments, event);

  if (event.agentId) {
    const existingIndex = agents.findIndex((agent) => agent.id === event.agentId);
    const previous = existingIndex >= 0
      ? agents[existingIndex]
      : createAgent(event.agentId, receivedAt);
    const mappedStatus = EVENT_STATUS.get(event.type);
    const status = event.status || mappedStatus || previous.status;
    const enteringActiveWork = ACTIVE_STATUSES.has(status)
      && !ACTIVE_STATUSES.has(previous.status);
    const completedAt = status === "done"
      ? previous.completedAt || receivedAt
      : undefined;

    const review = reduceReview(previous.review, event);
    const activityEvent = event.type === "heartbeat"
      ? previous.activityEvent
      : event.type;
    const activeTool = event.type === "tool.started"
      ? toolNameFromPhase(event.phase)
      : TOOL_CLEARING_EVENTS.has(event.type)
        ? undefined
        : previous.activeTool;
    const nextAgent = compactObject({
      ...previous,
      id: event.agentId,
      name: event.name || previous.name || humanizeIdentifier(event.agentId),
      role: event.role || previous.role || "agent",
      status,
      taskId: event.taskId || previous.taskId,
      task: event.task || previous.task,
      model: event.model || previous.model,
      effort: event.effort || previous.effort,
      phase: event.type === "tool.started" || event.type === "tool.finished"
        ? previous.phase
        : event.phase || previous.phase,
      activityEvent,
      activeTool,
      summary: event.summary || previous.summary,
      progress: event.progress ?? previous.progress,
      startedAt: enteringActiveWork
        ? receivedAt
        : previous.startedAt || (ACTIVE_STATUSES.has(status) ? receivedAt : undefined),
      completedAt,
      updatedAt: receivedAt,
      lastSeenAt: receivedAt,
      review,
    });

    if (existingIndex >= 0) agents[existingIndex] = nextAgent;
    else agents.push(nextAgent);
  }

  return {
    version: 1,
    project,
    runId: runId || null,
    mode: "live",
    updatedAt: receivedAt,
    agents,
    assignments,
  };
}

function toolNameFromPhase(phase) {
  if (typeof phase !== "string") return undefined;
  return sanitizeIdentifier(phase.replace(/^tool:/i, ""), 80);
}

function reduceAssignments(currentAssignments, event) {
  const assignments = currentAssignments.slice(-MAX_ASSIGNMENTS);
  const toAgentId = event.toAgentId || event.agentId;
  const fallbackId = assignmentFallbackId(event.taskId, toAgentId);
  const assignmentId = event.assignmentId || fallbackId;

  if (event.type === "task.assigned") {
    if (!assignmentId || !toAgentId) return assignments;

    const existingIndex = assignments.findIndex((assignment) => (
      assignment.id === assignmentId
      || (!event.assignmentId
        && assignment.taskId === event.taskId
        && assignment.toAgentId === toAgentId)
    ));
    const previous = existingIndex >= 0 ? assignments[existingIndex] : undefined;
    const nextAssignment = compactObject({
      ...previous,
      id: assignmentId,
      taskId: event.taskId || previous?.taskId,
      fromAgentId: event.fromAgentId || previous?.fromAgentId,
      toAgentId,
      title: event.title
        || event.task
        || previous?.title
        || humanizeIdentifier(event.taskId || assignmentId),
      summary: event.summary || previous?.summary,
      status: "assigned",
      assignedAt: previous?.assignedAt || event.receivedAt,
      updatedAt: event.receivedAt,
    });

    if (existingIndex >= 0) assignments[existingIndex] = nextAssignment;
    else assignments.push(nextAssignment);
    return assignments.slice(-MAX_ASSIGNMENTS);
  }

  const existingIndex = findAssignmentIndex(assignments, event);
  if (existingIndex < 0) return assignments;

  const previous = assignments[existingIndex];
  const status = assignmentStatusForEvent(event) || previous.status;
  assignments[existingIndex] = compactObject({
    ...previous,
    taskId: event.taskId || previous.taskId,
    fromAgentId: event.fromAgentId || previous.fromAgentId,
    toAgentId: event.toAgentId || previous.toAgentId,
    title: event.title || event.task || previous.title,
    summary: event.summary || previous.summary,
    status,
    updatedAt: event.receivedAt,
  });

  return assignments;
}

function findAssignmentIndex(assignments, event) {
  if (event.assignmentId) {
    return assignments.findIndex((assignment) => assignment.id === event.assignmentId);
  }

  if (!event.taskId || !event.agentId) return -1;
  return assignments.findIndex((assignment) => (
    assignment.taskId === event.taskId
    && assignment.toAgentId === event.agentId
  ));
}

function assignmentStatusForEvent(event) {
  return event.assignmentStatus || EVENT_ASSIGNMENT_STATUS.get(event.type);
}

function assignmentFallbackId(taskId, agentId) {
  if (!taskId || !agentId) return undefined;
  return sanitizeIdentifier(`${taskId}:${agentId}`, 192);
}

function createAgent(id, now) {
  return {
    id,
    name: humanizeIdentifier(id),
    role: id === "orchestrator" ? "orchestrator" : "agent",
    status: "idle",
    updatedAt: now,
    lastSeenAt: now,
  };
}

function reduceReview(previousReview, event) {
  if (event.review) return { ...previousReview, ...event.review };

  if (event.type === "review.started") {
    return compactObject({
      ...previousReview,
      status: "reviewing",
      reviewer: event.role,
    });
  }

  if (event.type === "review.approved") {
    return compactObject({
      ...previousReview,
      status: "approved",
      verdict: event.summary || "Approved",
    });
  }

  if (event.type === "review.revision_requested") {
    return compactObject({
      ...previousReview,
      status: "revision",
      verdict: event.summary || "Revision requested",
      attempts: Math.min((previousReview?.attempts || 0) + 1, 99),
    });
  }

  return previousReview;
}

function stateForResponse(now = Date.now()) {
  return {
    ...state,
    agents: state.agents.map((agent) => {
      const lastSeen = Date.parse(agent.lastSeenAt || agent.updatedAt || state.updatedAt);
      const stale = ACTIVE_STATUSES.has(agent.status)
        && Number.isFinite(lastSeen)
        && now - lastSeen > STALE_AFTER_MS;
      const started = Date.parse(agent.startedAt || "");
      const ended = Date.parse(agent.completedAt || "");
      const elapsedUntil = Number.isFinite(ended) ? ended : now;
      const elapsedSeconds = Number.isFinite(started)
        ? Math.max(0, Math.floor((elapsedUntil - started) / 1000))
        : 0;

      return {
        ...agent,
        stale,
        elapsedSeconds,
      };
    }),
  };
}

async function enqueuePersistence(operation) {
  const pending = persistenceQueue.then(operation);
  persistenceQueue = pending.catch(() => undefined);
  return pending;
}

async function persistSnapshot(snapshot) {
  await writeFile(STATE_TEMP_FILE, `${JSON.stringify(snapshot, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(STATE_TEMP_FILE, STATE_FILE);
}

function readJsonBody(request) {
  const declaredLength = Number(request.headers["content-length"] || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    request.resume();
    throw new RequestError(413, "request_body_too_large");
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    request.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        settled = true;
        request.resume();
        reject(new RequestError(413, "request_body_too_large"));
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      if (settled) return;
      settled = true;
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(text));
      } catch {
        reject(new RequestError(400, "invalid_json"));
      }
    });

    request.on("error", () => {
      if (settled) return;
      settled = true;
      reject(new RequestError(400, "request_stream_error"));
    });
  });
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

function allowedBrowserOrigin(origin) {
  if (typeof origin !== "string") return null;
  try {
    const url = new URL(origin);
    const localHost = url.hostname === "localhost"
      || url.hostname === "127.0.0.1"
      || url.hostname === "[::1]";
    if (!localHost || (url.protocol !== "http:" && url.protocol !== "https:")) {
      return READ_ONLY_WEB_ORIGINS.has(origin) && url.protocol === "https:"
        ? { origin, readOnly: true }
        : null;
    }
    return { origin, readOnly: false };
  } catch {
    return null;
  }
}

function isJsonContentType(contentType) {
  return typeof contentType === "string"
    && /^application\/json(?:\s*;|$)/i.test(contentType);
}

function normalizeEventType(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase().slice(0, 64);
  if (EVENT_TYPES.has(normalized)) return normalized;

  const signature = normalized.replace(/[^a-z0-9]+/g, "");
  return [...EVENT_TYPES].find((type) => (
    type.replace(/[^a-z0-9]+/g, "") === signature
  )) || normalized;
}

function sanitizeStatus(value) {
  if (typeof value !== "string") return undefined;
  const status = value.trim().toLowerCase();
  if (status === "failed" || status === "error") return "blocked";
  return STATUSES.has(status) ? status : undefined;
}

function sanitizeAssignmentStatus(value) {
  if (typeof value !== "string") return undefined;
  const status = value.trim().toLowerCase();
  if (status === "failed" || status === "error") return "blocked";
  if (status === "planning" || status === "idle") return "assigned";
  return ASSIGNMENT_STATUSES.has(status) ? status : undefined;
}

function sanitizeEffort(value) {
  if (typeof value !== "string") return undefined;
  const effort = value.trim().toLowerCase();
  return ALLOWED_EFFORTS.has(effort) ? effort : undefined;
}

function sanitizeIdentifier(value, maxLength) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const identifier = String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._:@-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
  return identifier || undefined;
}

function sanitizeDisplayText(value, maxLength) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;

  const text = String(value)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\b(?:sk|pk|rk)-[a-zA-Z0-9_-]{10,}\b/g, "[redacted]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(?:api[_-]?key|access[_-]?token|token|password|secret)\s*[:=]\s*\S+/gi, "[redacted]")
    .replace(/file:\/\/\S+/gi, "[path redacted]")
    .replace(/[a-zA-Z]:\\(?:[^\\\s]+\\)*[^\\\s]*/g, "[path redacted]")
    .replace(/(^|[\s("'`])(?:~\/|\/)(?:[^\s"'`<>]+\/)*[^\s"'`<>]*/g, "$1[path redacted]")
    .replace(/\b(?:[\w.-]+[\\/])+[\w.-]+\b/g, "[path redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

  return text || undefined;
}

function sanitizeTimestamp(value) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const milliseconds = Date.parse(String(value));
  if (!Number.isFinite(milliseconds)) return undefined;
  return new Date(milliseconds).toISOString();
}

function sanitizeProgress(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function sanitizeReview(value) {
  if (!isPlainObject(value)) return undefined;
  const attempts = Number(value.attempts);
  return compactObject({
    status: sanitizeDisplayText(value.status, 32),
    verdict: sanitizeDisplayText(value.verdict, 240),
    reviewer: sanitizeDisplayText(value.reviewer, 80),
    attempts: Number.isFinite(attempts)
      ? Math.max(0, Math.min(99, Math.floor(attempts)))
      : undefined,
  });
}

function humanizeIdentifier(value) {
  return value
    .replace(/[-_.]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .slice(0, 80);
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

function isPlainObject(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
