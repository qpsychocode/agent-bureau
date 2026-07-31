#!/usr/bin/env node

import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import process from "node:process";

const MODEL_SLUG = "cursor-grok-4.5-high-fast";
const MODEL_PROFILE = "Cursor Grok 4.5 High Fast";
const OBSERVER_ENDPOINT = process.env.BUREAU_OBSERVER_ENDPOINT
  || "http://127.0.0.1:7331/api/events";
const MAX_REPORT_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 12 * 60 * 1000;
const DEFAULT_MAX_TOOL_CALLS = 20;
const RESEARCH_WORKSPACE = join(tmpdir(), "agent-bureau-cursor-researcher");

class BureauError extends Error {
  constructor(code, message, exitCode) {
    super(message);
    this.name = "BureauError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

const options = parseArgs(process.argv.slice(2));
const projectDir = resolve(options.cwd || process.cwd());
let requestedModel = MODEL_SLUG;

try {
  const binary = await findAgentBinary();
  if (!binary) {
    throw new BureauError(
      "cursor_cli_missing",
      "Cursor Agent CLI не установлен. Установите официальный CLI, затем выполните авторизацию.",
      2,
    );
  }

  const modelProfile = resolveModelProfile(await listModels(binary));
  requestedModel = modelProfile.slug;

  if (options.check) {
    process.stdout.write(
      `ready: ${modelProfile.slug}\ndisplay: ${modelProfile.display}\nbinary: ${binary}\n`,
    );
    process.exitCode = 0;
  } else {
    const task = await readTask(options);
    if (!task.trim()) throw new BureauError("empty_task", "Исследовательская задача пуста.", 4);
    const taskId = safeId(options.taskId || `research-${Date.now()}`);
    const agentId = `researcher-${taskId}`;
    const outputPath = safeOutputPath(
      options.output || join("docs", "research", `${taskId}.md`),
      projectDir,
    );

    await emitEvent({
      type: "agent.spawned",
      agentId,
      name: "Ресерчер",
      role: "researcher",
      taskId,
      task: task.slice(0, 240),
      model: modelProfile.slug,
      effort: "high",
      summary: "Проверяет доступность Grok 4.5 High Fast",
    });

    const result = await runResearch(binary, task, {
      agentId,
      taskId,
      modelProfile,
      timeoutMs: boundedTimeout(process.env.BUREAU_RESEARCH_TIMEOUT_MS),
      maxToolCalls: boundedToolCalls(process.env.BUREAU_RESEARCH_MAX_TOOL_CALLS),
    });

    const report = formatReport({
      task,
      taskId,
      requestedModel: modelProfile.slug,
      actualModel: result.actualModel,
      result: result.text,
    });
    if (Buffer.byteLength(report, "utf8") > MAX_REPORT_BYTES) {
      throw new BureauError("report_too_large", "Отчёт превысил лимит 2 MiB.", 5);
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, report, { encoding: "utf8", mode: 0o600 });
    await emitEvent({
      type: "artifact.submitted",
      agentId,
      name: "Ресерчер",
      role: "researcher",
      taskId,
      task: task.slice(0, 240),
      model: modelProfile.slug,
      effort: "high",
      summary: "Исследовательский отчёт передан на верификацию",
      progress: 100,
    });

    process.stdout.write(`report: ${relative(projectDir, outputPath)}\nmodel: ${result.actualModel}\n`);
  }
} catch (error) {
  const bureauError = normalizeError(error);
  await emitEvent({
    type: "task.blocked",
    agentId: "researcher",
    name: "Ресерчер",
    role: "researcher",
    model: requestedModel,
    effort: "high",
    summary: bureauError.code,
  });
  process.stderr.write(`${bureauError.message}\n`);
  process.exitCode = bureauError.exitCode;
}

function parseArgs(args) {
  const parsed = { check: false, task: "", taskFile: "", taskId: "", output: "", cwd: "" };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--check") parsed.check = true;
    else if (arg === "--task") parsed.task = requiredValue(args, ++index, arg);
    else if (arg === "--task-file") parsed.taskFile = requiredValue(args, ++index, arg);
    else if (arg === "--task-id") parsed.taskId = requiredValue(args, ++index, arg);
    else if (arg === "--output") parsed.output = requiredValue(args, ++index, arg);
    else if (arg === "--cwd") parsed.cwd = requiredValue(args, ++index, arg);
    else throw new BureauError("unknown_argument", `Неизвестный аргумент: ${arg}`, 4);
  }
  return parsed;
}

function requiredValue(args, index, flag) {
  const value = args[index];
  if (!value) throw new BureauError("missing_argument", `Для ${flag} требуется значение.`, 4);
  return value;
}

async function readTask(parsed) {
  if (parsed.task && parsed.taskFile) {
    throw new BureauError("ambiguous_task", "Используйте только --task или --task-file.", 4);
  }
  if (parsed.taskFile) {
    const taskPath = resolve(projectDir, parsed.taskFile);
    if (!isWithin(projectDir, taskPath)) {
      throw new BureauError("task_outside_project", "Файл задачи должен находиться в проекте.", 4);
    }
    return readFile(taskPath, "utf8");
  }
  return parsed.task;
}

async function findAgentBinary() {
  const candidates = [
    process.env.CURSOR_AGENT_BIN,
    join(homedir(), ".local", "bin", "agent"),
    join(homedir(), ".local", "bin", "cursor-agent"),
    ...pathCandidates("agent"),
    ...pathCandidates("cursor-agent"),
  ].filter(Boolean);

  for (const candidate of [...new Set(candidates)]) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next known location.
    }
  }
  return null;
}

function pathCandidates(name) {
  return (process.env.PATH || "")
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => join(directory, name));
}

async function listModels(binary) {
  const attempts = [["--list-models"], ["models"]];
  let lastError = "";
  for (const args of attempts) {
    const result = await capture(binary, args, 45_000);
    if (result.code === 0) return `${result.stdout}\n${result.stderr}`;
    lastError = result.stderr || result.stdout;
  }
  throw new BureauError(
    "cursor_not_ready",
    `Cursor Agent CLI не готов. Проверьте авторизацию командой cursor-agent login.${safeDetail(lastError)}`,
    3,
  );
}

function resolveModelProfile(output) {
  const entries = output
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(\S+)\s+-\s+(.+?)\s*$/))
    .filter(Boolean)
    .map((match) => ({ slug: match[1], display: match[2] }));
  const candidates = entries.filter(({ slug }) => {
    const normalized = slug.toLowerCase();
    return normalized.includes("grok-4.5")
      && normalized.includes("high")
      && normalized.includes("fast");
  });

  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    const exact = candidates.find(({ slug }) => slug === MODEL_SLUG);
    if (exact) return exact;
    throw new BureauError(
      "model_ambiguous",
      `Cursor сообщил несколько профилей Grok 4.5 High Fast: ${candidates.map(({ slug }) => slug).join(", ")}.`,
      3,
    );
  }
  throw new BureauError(
    "model_unavailable",
    `Аккаунт Cursor не сообщил обязательный профиль ${MODEL_PROFILE}. Подмена запрещена.`,
    3,
  );
}

async function runResearch(binary, task, context) {
  const prompt = buildPrompt(task, context.modelProfile);
  await mkdir(RESEARCH_WORKSPACE, { recursive: true, mode: 0o700 });
  await emitEvent({
    type: "task.started",
    agentId: context.agentId,
    name: "Ресерчер",
    role: "researcher",
    taskId: context.taskId,
    task: task.slice(0, 240),
    model: context.modelProfile.slug,
    effort: "high",
    phase: "research",
    summary: "Ищет и проверяет внешние источники",
  });

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      binary,
      [
        "--trust",
        "--sandbox",
        "enabled",
        "--auto-review",
        "--mode=ask",
        "--model",
        context.modelProfile.slug,
        "--print",
        "--output-format",
        "stream-json",
        prompt,
      ],
      { cwd: RESEARCH_WORKSPACE, stdio: ["ignore", "pipe", "pipe"] },
    );

    let stdoutBuffer = "";
    let stderr = "";
    let actualModel = "";
    let finalText = "";
    let toolCallCount = 0;
    let settled = false;

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      rejectOnce(new BureauError("research_timeout", "Researcher остановлен по лимиту времени.", 5));
    }, context.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk;
      let newline = stdoutBuffer.indexOf("\n");
      while (newline >= 0) {
        const line = stdoutBuffer.slice(0, newline).trim();
        stdoutBuffer = stdoutBuffer.slice(newline + 1);
        if (line) handleLine(line);
        newline = stdoutBuffer.indexOf("\n");
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4_000);
    });
    child.on("error", (error) => rejectOnce(error));
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (settled) return;
      if (code !== 0) {
        rejectOnce(new BureauError("cursor_run_failed", `Cursor Researcher завершился с кодом ${code}.${safeDetail(stderr)}`, 5));
        return;
      }
      if (!actualModel || !isActualProfile(actualModel, context.modelProfile)) {
        rejectOnce(new BureauError("model_mismatch", "Не удалось подтвердить фактический профиль Grok 4.5 High Fast.", 5));
        return;
      }
      if (!finalText.trim()) {
        rejectOnce(new BureauError("empty_report", "Cursor не вернул финальный исследовательский отчёт.", 5));
        return;
      }
      settled = true;
      resolvePromise({ actualModel, text: finalText.trim() });
    });

    function handleLine(line) {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (event?.type === "system" && event?.subtype === "init") {
        actualModel = typeof event.model === "string" ? event.model : "";
        if (!isActualProfile(actualModel, context.modelProfile)) {
          child.kill("SIGTERM");
          rejectOnce(new BureauError("model_mismatch", `Cursor запустил ${actualModel || "unknown"} вместо ${context.modelProfile.display} (${context.modelProfile.slug}).`, 5));
        }
      }
      if (event?.type === "tool_call" && event?.subtype === "started") {
        toolCallCount += 1;
        if (toolCallCount > context.maxToolCalls) {
          child.kill("SIGTERM");
          rejectOnce(new BureauError(
            "research_budget_exceeded",
            `Researcher остановлен после ${context.maxToolCalls} tool calls.`,
            5,
          ));
          return;
        }
        void emitEvent({
          type: "heartbeat",
          agentId: context.agentId,
          name: "Ресерчер",
          role: "researcher",
          taskId: context.taskId,
          model: context.modelProfile.slug,
          effort: "high",
          phase: "research",
        });
      }
      if (event?.type === "result" && event?.subtype === "success") {
        finalText = typeof event.result === "string" ? event.result : "";
      }
    }

    function rejectOnce(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      rejectPromise(error);
    }
  });
}

function buildPrompt(task, modelProfile) {
  return [
    "Ты Researcher агентского бюро. Работай в Ask mode и ничего не изменяй в проекте.",
    "Нужен доказательный ответ для решения оркестратора, а не общий обзор.",
    "Используй первичные и официальные источники в приоритете.",
    "Для изменчивых фактов указывай дату. Не выдумывай подтверждение.",
    "Лимит: не более двух раундов поиска и двенадцати поисковых запросов.",
    `Runtime preflight уже подтвердил профиль ${modelProfile.slug} (${modelProfile.display}); не утверждай, что CLI или model list не проверялись.`,
    "Фактическая модель этой сессии отдельно проверяется adapter по system/init.",
    "Верни Markdown с разделами: Короткий ответ; Выводы; Противоречия и неизвестное; Рекомендация оркестратору; Источники; Журнал поиска.",
    "В журнале указывай запросы и границы поиска, но не раскрывай скрытые пошаговые рассуждения.",
    "",
    "Задача:",
    task.trim(),
  ].join("\n");
}

function isActualProfile(model, profile) {
  const actual = normalizeModelName(model);
  return actual === normalizeModelName(profile.display)
    || actual === normalizeModelName(profile.slug);
}

function normalizeModelName(value) {
  return value.toLowerCase().replace(/[^a-z0-9.]+/g, "");
}

function formatReport({ task, taskId, requestedModel: modelSlug, actualModel, result }) {
  const now = new Date().toISOString();
  return [
    `# Research report — ${taskId}`,
    "",
    `- Дата актуальности: ${now}`,
    `- Запрошенный профиль: ${MODEL_PROFILE}`,
    `- Запрошенный Cursor slug: ${modelSlug}`,
    `- Фактическая модель: ${actualModel}`,
    "- Runtime: Cursor Agent CLI / Ask mode",
    "",
    "## Исследовательская задача",
    "",
    task.trim(),
    "",
    cleanResearchResult(result),
    "",
  ].join("\n");
}

function cleanResearchResult(result) {
  const text = result.trim();
  const markers = ["# Research:", "## Короткий ответ"];
  const offsets = markers
    .map((marker) => text.indexOf(marker))
    .filter((offset) => offset >= 0);
  if (!offsets.length) return text;
  return text.slice(Math.min(...offsets)).trim();
}

function safeOutputPath(output, root) {
  const target = isAbsolute(output) ? resolve(output) : resolve(root, output);
  if (!isWithin(root, target)) {
    throw new BureauError("output_outside_project", "Отчёт должен сохраняться внутри проекта.", 4);
  }
  return target;
}

function isWithin(root, target) {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function safeId(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `research-${Date.now()}`;
}

function boundedTimeout(value) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(parsed, 60_000), 30 * 60 * 1000);
}

function boundedToolCalls(value) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_TOOL_CALLS;
  return Math.min(Math.max(parsed, 4), 40);
}

async function capture(binary, args, timeoutMs) {
  return new Promise((resolvePromise) => {
    const child = spawn(binary, args, { cwd: projectDir, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-256_000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-16_000); });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolvePromise({ code: 1, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolvePromise({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function emitEvent(event) {
  try {
    await fetch(OBSERVER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timestamp: new Date().toISOString(), ...event }),
      signal: AbortSignal.timeout(700),
    });
  } catch {
    // Observability must never control the research outcome.
  }
}

function safeDetail(text) {
  if (!text) return "";
  const cleaned = text.replace(/\s+/g, " ").trim().slice(0, 280);
  return cleaned ? ` Деталь: ${cleaned}` : "";
}

function normalizeError(error) {
  if (error instanceof BureauError) return error;
  return new BureauError("unexpected_error", error instanceof Error ? error.message : "Неизвестная ошибка.", 1);
}
