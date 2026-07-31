import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_DIR = dirname(SCRIPT_DIR);
const IS_WINDOWS = process.platform === "win32";
const VINEXT_CLI = join(WORKSPACE_DIR, "node_modules", "vinext", "dist", "cli.js");
const devArguments = [VINEXT_CLI, "dev"];

if (process.argv.length > 2) {
  devArguments.push(...process.argv.slice(2));
}

const children = new Map();
let shuttingDown = false;
let requestedSignal = null;

const observer = launch("observer", process.execPath, [join(SCRIPT_DIR, "observer.mjs")]);
const frontend = launch("frontend", process.execPath, devArguments, {
  WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH
    || join(WORKSPACE_DIR, ".wrangler", "wrangler.log"),
});

for (const [name, child] of children) {
  child.once("error", (error) => {
    console.error(`[office] ${name} could not start: ${error.message}`);
    void shutdown(1);
  });

  child.once("exit", (code, signal) => {
    children.delete(name);
    if (shuttingDown) {
      finishWhenStopped();
      return;
    }

    const exitCode = Number.isInteger(code) ? code : signal ? 1 : 0;
    console.log(`[office] ${name} stopped${signal ? ` (${signal})` : ""}.`);
    void shutdown(exitCode);
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    requestedSignal = signal;
    void shutdown(signal === "SIGINT" ? 130 : 143, signal);
  });
}

console.log("[office] Starting pixel office and local telemetry collector.");

function launch(name, command, args, extraEnvironment = {}) {
  const child = spawn(command, args, {
    cwd: WORKSPACE_DIR,
    env: { ...process.env, ...extraEnvironment },
    stdio: "inherit",
    detached: !IS_WINDOWS,
  });
  children.set(name, child);
  return child;
}

async function shutdown(exitCode, signal = "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = exitCode;

  for (const child of children.values()) terminateTree(child, signal);

  const forceTimer = setTimeout(() => {
    for (const child of children.values()) terminateTree(child, "SIGKILL");
  }, 5_000);
  forceTimer.unref();

  finishWhenStopped();
}

function finishWhenStopped() {
  if (children.size > 0) return;
  if (requestedSignal) {
    console.log(`[office] Stopped (${requestedSignal}).`);
  }
}

function terminateTree(child, signal) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;

  try {
    if (IS_WINDOWS) child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") {
      console.error(`[office] Could not stop child ${child.pid}: ${error.message}`);
    }
  }
}

void observer;
void frontend;
