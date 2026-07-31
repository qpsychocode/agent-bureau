const OBSERVER_ENDPOINT = "http://127.0.0.1:7331/api/events";
const MAX_HOOK_PAYLOAD_BYTES = 256 * 1024;

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
  const response = await fetch(OBSERVER_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(1_500),
  });

  if (!response.ok) throw new Error(`observer_http_${response.status}`);
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
