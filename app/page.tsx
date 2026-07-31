"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import demoState from "./demo-state.json";

type AgentStatus =
  | "idle"
  | "planning"
  | "working"
  | "reviewing"
  | "revision"
  | "blocked"
  | "done";

type AssignmentStatus =
  | "assigned"
  | "working"
  | "reviewing"
  | "revision"
  | "blocked"
  | "done";

type Review = {
  status?: string;
  verdict?: string;
  reviewer?: string;
  attempts?: number;
};

type Agent = {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  taskId?: string;
  task?: string;
  model?: string;
  effort?: string;
  phase?: string;
  summary?: string;
  progress?: number;
  startedAt?: string;
  completedAt?: string;
  updatedAt?: string;
  elapsedSeconds?: number;
  stale?: boolean;
  review?: Review;
};

type TaskAssignment = {
  id: string;
  taskId?: string;
  fromAgentId?: string;
  toAgentId: string;
  title: string;
  summary?: string;
  status: AssignmentStatus;
  assignedAt: string;
  updatedAt: string;
};

type RoutedAssignment = TaskAssignment & {
  inferred?: boolean;
};

type BureauState = {
  version: number;
  project: string;
  runId?: string | null;
  mode: "live" | "demo";
  updatedAt: string;
  agents: Agent[];
  assignments?: TaskAssignment[];
};

type WorkerSlot = "research" | "code" | "review" | "creative";
type StageSlot = "orchestrator" | WorkerSlot;

const DEMO_STATE = demoState as BureauState;

const COLLECTOR_URL = "http://127.0.0.1:7331/api/state";

const ACTIVE_STATUSES = new Set<AgentStatus>([
  "planning",
  "working",
  "reviewing",
  "revision",
]);

const STATUS_META: Record<AgentStatus, { label: string; short: string }> = {
  idle: { label: "Свободен", short: "резерв" },
  planning: { label: "Планирует", short: "план" },
  working: { label: "Работает", short: "в работе" },
  reviewing: { label: "Проверяет", short: "ревью" },
  revision: { label: "Дорабатывает", short: "правки" },
  blocked: { label: "Заблокирован", short: "блокер" },
  done: { label: "Готово", short: "готово" },
};

const ASSIGNMENT_META: Record<AssignmentStatus, string> = {
  assigned: "Передана",
  working: "В работе",
  reviewing: "На проверке",
  revision: "На доработке",
  blocked: "Заблокирована",
  done: "Завершена",
};

const ROLE_LABELS: Record<string, string> = {
  orchestrator: "Оркестратор",
  coder: "Разработчик",
  designer: "Дизайнер",
  image: "Иллюстратор",
  reviewer: "Верификатор",
  copywriter: "Копирайтер",
  marketing: "Маркетолог",
  researcher: "Исследователь",
  agent: "Специалист",
};

const ROLE_COLORS: Record<string, string> = {
  orchestrator: "#f0b25e",
  coder: "#6fe0ae",
  designer: "#b59cff",
  image: "#ef8d70",
  reviewer: "#72cde9",
  copywriter: "#f1cf72",
  marketing: "#ef8eac",
  researcher: "#68d2c8",
  agent: "#b5bbca",
};

const STAGE_SLOTS: Record<
  StageSlot,
  { x: number; y: number; width: number; height: number; label: string }
> = {
  orchestrator: {
    x: 44,
    y: 24,
    width: 18,
    height: 29,
    label: "Центр управления",
  },
  research: {
    x: 72,
    y: 24,
    width: 18,
    height: 29,
    label: "Исследовательский кабинет",
  },
  code: {
    x: 20,
    y: 61,
    width: 21,
    height: 32,
    label: "Левое рабочее место",
  },
  review: {
    x: 45,
    y: 61,
    width: 20,
    height: 32,
    label: "Центральное рабочее место",
  },
  creative: {
    x: 71,
    y: 61,
    width: 21,
    height: 32,
    label: "Правая студия",
  },
};

const WORKER_SLOTS: WorkerSlot[] = ["research", "code", "review", "creative"];

function isAgentStatus(value: unknown): value is AgentStatus {
  return typeof value === "string" && value in STATUS_META;
}

function isAssignmentStatus(value: unknown): value is AssignmentStatus {
  return typeof value === "string" && value in ASSIGNMENT_META;
}

function normalizeState(value: unknown): BureauState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<BureauState>;
  if (!Array.isArray(candidate.agents)) return null;

  const agents = candidate.agents
    .filter((agent): agent is Agent => {
      if (!agent || typeof agent !== "object") return false;
      return (
        typeof agent.id === "string" &&
        typeof agent.name === "string" &&
        isAgentStatus(agent.status)
      );
    })
    .slice(0, 200);

  const assignments = Array.isArray(candidate.assignments)
    ? candidate.assignments
        .filter((assignment): assignment is TaskAssignment => {
          if (!assignment || typeof assignment !== "object") return false;
          return (
            typeof assignment.id === "string" &&
            typeof assignment.toAgentId === "string" &&
            typeof assignment.title === "string" &&
            typeof assignment.assignedAt === "string" &&
            typeof assignment.updatedAt === "string" &&
            isAssignmentStatus(assignment.status)
          );
        })
        .slice(-50)
    : [];

  return {
    version: 1,
    project:
      typeof candidate.project === "string" ? candidate.project : "Agent Bureau",
    runId: typeof candidate.runId === "string" ? candidate.runId : null,
    mode: "live",
    updatedAt:
      typeof candidate.updatedAt === "string"
        ? candidate.updatedAt
        : new Date().toISOString(),
    agents,
    assignments,
  };
}

function roleKey(role: string) {
  const normalized = role.trim().toLowerCase();
  if (normalized.includes("orchestrat") || normalized.includes("оркестр")) {
    return "orchestrator";
  }
  if (
    normalized.includes("review") ||
    normalized.includes("verif") ||
    normalized.includes("вериф") ||
    normalized.includes("провер")
  ) {
    return "reviewer";
  }
  if (normalized.includes("design") || normalized.includes("дизайн")) {
    return "designer";
  }
  if (
    normalized.includes("image") ||
    normalized.includes("illustr") ||
    normalized.includes("иллюстр")
  ) {
    return "image";
  }
  if (
    normalized.includes("copy") ||
    normalized.includes("writer") ||
    normalized.includes("копирай")
  ) {
    return "copywriter";
  }
  if (normalized.includes("market") || normalized.includes("маркет")) {
    return "marketing";
  }
  if (
    normalized.includes("research") ||
    normalized.includes("исслед") ||
    normalized.includes("ресерч")
  ) {
    return "researcher";
  }
  if (
    normalized.includes("code") ||
    normalized.includes("develop") ||
    normalized.includes("разработ") ||
    normalized.includes("кодер")
  ) {
    return "coder";
  }
  return normalized || "agent";
}

function roleLabel(role: string) {
  return ROLE_LABELS[roleKey(role)] ?? role ?? "Специалист";
}

function roleColor(role: string) {
  return ROLE_COLORS[roleKey(role)] ?? ROLE_COLORS.agent;
}

function preferredSlot(agent: Agent): WorkerSlot | null {
  const key = roleKey(agent.role);
  if (key === "researcher") return "research";
  if (key === "coder") return "code";
  if (key === "reviewer") return "review";
  if (["designer", "image", "copywriter", "marketing"].includes(key)) {
    return "creative";
  }
  return null;
}

function assignmentStatusFor(status: AgentStatus): AssignmentStatus {
  if (status === "planning" || status === "idle") return "assigned";
  return status;
}

function progressFor(agent: Agent) {
  if (typeof agent.progress === "number") {
    return Math.max(0, Math.min(100, Math.round(agent.progress)));
  }
  return {
    idle: 0,
    planning: 18,
    working: 54,
    reviewing: 78,
    revision: 66,
    blocked: 42,
    done: 100,
  }[agent.status];
}

function formatDuration(seconds = 0) {
  if (seconds < 60) return `${Math.max(0, seconds)} сек`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes}м ${rest}с` : `${minutes} мин`;
  return `${Math.floor(minutes / 60)}ч ${minutes % 60}м`;
}

function formatClock(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatMoment(value?: string) {
  if (!value) return "время не указано";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "время не указано";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildAssignments(
  state: BureauState,
  orchestrator?: Agent,
): RoutedAssignment[] {
  const explicit = [...(state.assignments ?? [])].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
  const explicitRecipients = new Set(explicit.map((item) => item.toAgentId));

  const inferred = state.agents
    .filter(
      (agent) =>
        agent.id !== orchestrator?.id &&
        Boolean(agent.task) &&
        !explicitRecipients.has(agent.id),
    )
    .map<RoutedAssignment>((agent) => ({
      id: `legacy:${agent.taskId ?? agent.id}`,
      taskId: agent.taskId,
      fromAgentId: orchestrator?.id,
      toAgentId: agent.id,
      title: agent.task ?? "Текущая задача",
      summary: agent.summary,
      status: assignmentStatusFor(agent.status),
      assignedAt: agent.startedAt ?? agent.updatedAt ?? state.updatedAt,
      updatedAt: agent.updatedAt ?? state.updatedAt,
      inferred: true,
    }));

  return [...explicit, ...inferred];
}

function arrangeStage(agents: Agent[]) {
  const orchestrator = agents.find(
    (agent) => roleKey(agent.role) === "orchestrator",
  );
  const candidates = agents
    .filter((agent) => agent.id !== orchestrator?.id)
    .sort((left, right) => {
      const leftActive = ACTIVE_STATUSES.has(left.status) ? 0 : 1;
      const rightActive = ACTIVE_STATUSES.has(right.status) ? 0 : 1;
      return leftActive - rightActive || left.id.localeCompare(right.id);
    });

  const occupants: Partial<Record<WorkerSlot, Agent>> = {};
  const remaining = [...candidates];

  for (const slot of WORKER_SLOTS) {
    const index = remaining.findIndex((agent) => preferredSlot(agent) === slot);
    if (index >= 0) occupants[slot] = remaining.splice(index, 1)[0];
  }

  for (const slot of WORKER_SLOTS) {
    if (!occupants[slot] && remaining.length) occupants[slot] = remaining.shift();
  }

  return { orchestrator, occupants, overflow: remaining };
}

function AgentHotspot({
  agent,
  slot,
  assignment,
  selected,
  onSelect,
}: {
  agent: Agent;
  slot: StageSlot;
  assignment?: RoutedAssignment;
  selected: boolean;
  onSelect: () => void;
}) {
  const coordinates = STAGE_SLOTS[slot];
  const meta = STATUS_META[agent.status];
  const style = {
    left: `${coordinates.x}%`,
    top: `${coordinates.y}%`,
    width: `${coordinates.width}%`,
    height: `${coordinates.height}%`,
    "--role-accent": roleColor(agent.role),
  } as CSSProperties;

  return (
    <button
      type="button"
      className={`agent-hotspot hotspot-${slot} status-${agent.status}${
        selected ? " is-selected" : ""
      }`}
      style={style}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${agent.name}, ${meta.label}. ${
        assignment?.title ?? agent.task ?? "Без задачи"
      }. Открыть назначение`}
      title={`${coordinates.label}: ${agent.name}`}
    >
      <span className="hotspot-focus" aria-hidden="true" />
      <span className="agent-label">
        <i aria-hidden="true" />
        <span>
          <strong>{agent.name}</strong>
          <small>
            {slot === "orchestrator"
              ? "раздаёт задачи ↓"
              : `${assignment?.taskId ?? "без ID"} · ${meta.short}`}
          </small>
        </span>
      </span>
    </button>
  );
}

function AssignmentInspector({
  agent,
  assignment,
  source,
}: {
  agent?: Agent;
  assignment?: RoutedAssignment;
  source?: Agent;
}) {
  if (!agent) {
    return (
      <aside className="inspector empty-inspector">
        <span className="inspector-kicker">НАЗНАЧЕНИЕ</span>
        <div className="empty-glyph" aria-hidden="true">↘</div>
        <h2>Выбери маршрут</h2>
        <p>Нажми на агента или пакет задачи в офисе.</p>
      </aside>
    );
  }

  const isOrchestrator = roleKey(agent.role) === "orchestrator";
  const progress = progressFor(agent);
  const style = { "--role-accent": roleColor(agent.role) } as CSSProperties;
  const assignmentLabel = assignment
    ? ASSIGNMENT_META[assignment.status]
    : STATUS_META[agent.status].label;

  return (
    <aside className="inspector" style={style} aria-live="polite">
      <div className="inspector-topline">
        <span className="inspector-kicker">
          {isOrchestrator ? "ЦЕНТР УПРАВЛЕНИЯ" : "НАЗНАЧЕНИЕ ОТ ОРКЕСТРАТОРА"}
        </span>
        <span className={`status-pill status-pill-${agent.status}`}>
          <i />{assignmentLabel}
        </span>
      </div>

      <div className="route-title">
        <span>{isOrchestrator ? "СТРАТЕГИЯ" : source?.name ?? "Внешняя очередь"}</span>
        <b aria-hidden="true">{isOrchestrator ? "⌁" : "→"}</b>
        <span>{isOrchestrator ? "ИСПОЛНИТЕЛИ" : agent.name}</span>
      </div>

      <div className="identity-line">
        <div className="identity-beacon" aria-hidden="true"><i /></div>
        <div>
          <h2>{agent.name}</h2>
          <p>{roleLabel(agent.role)}</p>
        </div>
      </div>

      {agent.stale && (
        <div className="stale-warning">
          Сигнал давно не обновлялся. Статус может быть устаревшим.
        </div>
      )}

      <section className="task-card">
        <div className="task-card-heading">
          <span>{isOrchestrator ? "ТЕКУЩАЯ ЦЕЛЬ" : "ПЕРЕДАННАЯ ЗАДАЧА"}</span>
          <code>{assignment?.taskId ?? agent.taskId ?? "NO-ID"}</code>
        </div>
        <h3>{assignment?.title ?? agent.task ?? "Ожидает назначения"}</h3>
        <p>
          {assignment?.summary ??
            agent.summary ??
            "Агент пока не оставил безопасное краткое резюме."}
        </p>
      </section>

      {!isOrchestrator && assignment?.inferred && (
        <p className="inference-note">
          Связь восстановлена по текущей задаче агента: старое событие не содержало
          отдельной записи назначения.
        </p>
      )}

      <section className="progress-block">
        <div>
          <span>Фаза: {agent.phase?.replace(/^tool:/, "") || STATUS_META[agent.status].short}</span>
          <strong>{progress}%</strong>
        </div>
        <div className="progress-track" aria-label={`Прогресс ${progress}%`}>
          <i style={{ width: `${progress}%` }} />
        </div>
      </section>

      <dl className="detail-grid">
        <div><dt>Модель</dt><dd>{agent.model || "не указана"}</dd></div>
        <div><dt>Reasoning</dt><dd>{agent.effort || "по умолчанию"}</dd></div>
        <div><dt>В работе</dt><dd>{formatDuration(agent.elapsedSeconds)}</dd></div>
        <div>
          <dt>Передано</dt>
          <dd>{formatMoment(assignment?.assignedAt ?? agent.startedAt)}</dd>
        </div>
      </dl>

      {agent.review && (
        <section className="review-card">
          <div><span>ВЕРИФИКАЦИЯ</span><b>{agent.review.status || "в процессе"}</b></div>
          <p>{agent.review.verdict || "Результат ещё проверяется."}</p>
          <small>
            Проверяющий: {agent.review.reviewer || "не назначен"} · попытка {agent.review.attempts ?? 1}
          </small>
        </section>
      )}

      <div className="privacy-note">
        <i aria-hidden="true">◆</i>
        <p>Только безопасное резюме. Промпты, файлы и внутренние рассуждения не передаются.</p>
      </div>
    </aside>
  );
}

export default function Home() {
  const [liveState, setLiveState] = useState<BureauState | null>(null);
  const [connection, setConnection] = useState<"connecting" | "live" | "offline">(
    "connecting",
  );
  const [viewMode, setViewMode] = useState<"live" | "demo">("live");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clock, setClock] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      try {
        const response = await fetch(COLLECTOR_URL, {
          cache: "no-store",
          signal: AbortSignal.timeout(1_800),
        });
        if (!response.ok) throw new Error("collector_unavailable");
        const normalized = normalizeState(await response.json());
        if (!normalized) throw new Error("invalid_state");
        if (!cancelled) {
          setLiveState(normalized);
          setConnection("live");
        }
      } catch {
        if (!cancelled) setConnection("offline");
      }
    };

    void sync();
    const poller = window.setInterval(sync, 2_500);
    return () => {
      cancelled = true;
      window.clearInterval(poller);
    };
  }, []);

  useEffect(() => {
    const initialTick = window.setTimeout(() => setClock(new Date()), 0);
    const ticker = window.setInterval(() => setClock(new Date()), 1_000);
    return () => {
      window.clearTimeout(initialTick);
      window.clearInterval(ticker);
    };
  }, []);

  const hasLiveAgents = Boolean(liveState?.agents.length);
  const usingDemo = viewMode === "demo" || !hasLiveAgents;
  const state = usingDemo ? DEMO_STATE : (liveState as BureauState);

  const stage = useMemo(() => arrangeStage(state.agents), [state.agents]);
  const assignments = useMemo(
    () => buildAssignments(state, stage.orchestrator),
    [stage.orchestrator, state],
  );
  const latestAssignmentByAgent = useMemo(() => {
    const result = new Map<string, RoutedAssignment>();
    for (const assignment of assignments) {
      if (!result.has(assignment.toAgentId)) {
        result.set(assignment.toAgentId, assignment);
      }
    }
    return result;
  }, [assignments]);

  const firstAssignedAgent = assignments
    .map((assignment) => state.agents.find((agent) => agent.id === assignment.toAgentId))
    .find(Boolean);
  const fallbackAgent = firstAssignedAgent ?? stage.orchestrator ?? state.agents[0];
  const selectedAgent =
    state.agents.find((agent) => agent.id === selectedId) ?? fallbackAgent;
  const effectiveSelectedId = selectedAgent?.id ?? "";
  const selectedAssignment = selectedAgent
    ? latestAssignmentByAgent.get(selectedAgent.id)
    : undefined;
  const assignmentSource = selectedAssignment?.fromAgentId
    ? state.agents.find((agent) => agent.id === selectedAssignment.fromAgentId)
    : stage.orchestrator;

  const activeCount = state.agents.filter((agent) =>
    ACTIVE_STATUSES.has(agent.status),
  ).length;
  const reviewingCount = state.agents.filter(
    (agent) => agent.status === "reviewing",
  ).length;
  const doneCount = state.agents.filter((agent) => agent.status === "done").length;

  const toggleMode = () => {
    if (!hasLiveAgents) return;
    setViewMode((mode) => (mode === "live" ? "demo" : "live"));
  };

  return (
    <main className="bureau-shell">
      <div className="page-noise" aria-hidden="true" />

      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-sigil" aria-hidden="true">⌬</span>
          <div>
            <span>AGENT BUREAU / LOCAL OBSERVER</span>
            <h1>Агентское бюро</h1>
          </div>
        </div>

        <div className="topbar-stats" aria-label="Статистика офиса">
          <div><strong>{activeCount}</strong><span>в работе</span></div>
          <div><strong>{reviewingCount}</strong><span>на ревью</span></div>
          <div><strong>{doneCount}</strong><span>готово</span></div>
        </div>

        <div className="connection-panel">
          <button
            type="button"
            className="mode-switch"
            onClick={toggleMode}
            disabled={!hasLiveAgents}
            title={
              hasLiveAgents
                ? "Переключить живые и демонстрационные данные"
                : "Живые события пока не поступали"
            }
          >
            <i className={`connection-dot ${connection}`} />
            <span>
              <b>{usingDemo ? "Демо-смена" : "В эфире"}</b>
              <small>
                {usingDemo ? "встроенный demo snapshot" : "collector подключён"}
              </small>
            </span>
          </button>
          <time dateTime={clock?.toISOString()}>{clock ? formatClock(clock) : "--:--:--"}</time>
        </div>
      </header>

      <section className="project-strip">
        <div><span>ПРОЕКТ</span><strong>{state.project}</strong></div>
        <p>
          {usingDemo
            ? "Учебная смена показывает передачу задач и роли агентов."
            : `Живой снимок · ${state.agents.length} агентов · ${assignments.length} назначений`}
        </p>
        <span className="privacy-chip">
          <i /> {usingDemo ? "public demo" : "local live"}
        </span>
      </section>

      <div className="dashboard-grid">
        <section className="office-frame" aria-labelledby="office-title">
          <div className="scene-header">
            <div>
              <span className="floor-light" />
              <div><b id="office-title">ЖИВОЙ ОФИС</b><small>оркестратор → исполнители</small></div>
            </div>
            <p><i aria-hidden="true">↘</i> Нажми на агента или пакет задачи</p>
          </div>

          <div className="scene-scroll" tabIndex={0} aria-label="Прокручиваемая карта офиса">
            <figure className="office-stage" aria-label="Иерархия назначений">
              <Image
                className="office-art"
                src="/og.png"
                alt=""
                aria-hidden="true"
                width={1672}
                height={941}
                priority
              />
              <div className="stage-shade" aria-hidden="true" />

              {stage.orchestrator ? (
                <AgentHotspot
                  agent={stage.orchestrator}
                  slot="orchestrator"
                  selected={effectiveSelectedId === stage.orchestrator.id}
                  onSelect={() => setSelectedId(stage.orchestrator?.id ?? null)}
                />
              ) : (
                <div className="missing-source" role="status">
                  <strong>Внешняя очередь</strong>
                  <small>оркестратор не передал live-событие</small>
                </div>
              )}

              <div
                className={`hierarchy-network${stage.orchestrator ? " has-source" : ""}`}
                aria-hidden="true"
              >
                <span className="route-line hierarchy-stem" />
                <span className="route-line hierarchy-bus" />
                {WORKER_SLOTS.filter((slot) => slot !== "research").map((slot) => {
                  const agent = stage.occupants[slot];
                  const assignment = agent
                    ? latestAssignmentByAgent.get(agent.id)
                    : undefined;
                  return (
                    <span
                      key={slot}
                      className={`route-line lower-branch branch-${slot}${
                        assignment ? " is-active" : ""
                      }`}
                    >
                      {assignment && ACTIVE_STATUSES.has(agent?.status ?? "idle") && (
                        <i className="flight-pixel" />
                      )}
                    </span>
                  );
                })}
                <span
                  className={`route-line research-link${
                    stage.occupants.research &&
                    latestAssignmentByAgent.has(stage.occupants.research.id)
                      ? " is-active"
                      : ""
                  }`}
                >
                  {stage.occupants.research &&
                    latestAssignmentByAgent.has(stage.occupants.research.id) &&
                    ACTIVE_STATUSES.has(stage.occupants.research.status) && (
                      <i className="flight-pixel" />
                    )}
                </span>
              </div>

              {WORKER_SLOTS.map((slot) => {
                const agent = stage.occupants[slot];
                if (!agent) return null;
                const assignment = latestAssignmentByAgent.get(agent.id);
                return (
                  <AgentHotspot
                    key={agent.id}
                    agent={agent}
                    slot={slot}
                    assignment={assignment}
                    selected={effectiveSelectedId === agent.id}
                    onSelect={() => setSelectedId(agent.id)}
                  />
                );
              })}

              {WORKER_SLOTS.map((slot) => {
                const agent = stage.occupants[slot];
                if (!agent) return null;
                const assignment = latestAssignmentByAgent.get(agent.id);
                if (!assignment) return null;
                return (
                  <button
                    key={`packet-${assignment.id}`}
                    type="button"
                    className={`task-packet packet-${slot}${
                      effectiveSelectedId === agent.id ? " is-selected" : ""
                    }`}
                    onClick={() => setSelectedId(agent.id)}
                    aria-label={`Открыть задачу ${assignment.title}, переданную агенту ${agent.name}`}
                    title={assignment.title}
                  >
                    <i aria-hidden="true">◆</i>
                    <span>{assignment.taskId ?? "TASK"}</span>
                  </button>
                );
              })}

              {stage.overflow.length > 0 && (
                <button
                  type="button"
                  className="overflow-chip"
                  onClick={() => setSelectedId(stage.overflow[0]?.id ?? null)}
                >
                  +{stage.overflow.length} в пуле
                </button>
              )}
            </figure>
          </div>

          <div className="route-ledger" aria-label="Маршруты задач">
            <div className="route-ledger-title">
              <span>МАРШРУТЫ ЗАДАЧ</span>
              <small>{assignments.length || "нет"} в текущем снимке</small>
            </div>
            <div className="route-ledger-list">
              {assignments.length ? (
                assignments.map((assignment) => {
                  const recipient = state.agents.find(
                    (agent) => agent.id === assignment.toAgentId,
                  );
                  const source = assignment.fromAgentId
                    ? state.agents.find((agent) => agent.id === assignment.fromAgentId)
                    : stage.orchestrator;
                  return (
                    <button
                      type="button"
                      key={assignment.id}
                      className={effectiveSelectedId === recipient?.id ? "active" : ""}
                      onClick={() => recipient && setSelectedId(recipient.id)}
                      disabled={!recipient}
                    >
                      <span><b>{source?.name ?? "Внешняя очередь"}</b><i>→</i><b>{recipient?.name ?? assignment.toAgentId}</b></span>
                      <small>{assignment.taskId ?? "NO-ID"} · {assignment.title}</small>
                    </button>
                  );
                })
              ) : (
                <p>Назначения ещё не поступили.</p>
              )}
            </div>
          </div>
        </section>

        <AssignmentInspector
          agent={selectedAgent}
          assignment={selectedAssignment}
          source={assignmentSource}
        />
      </div>

      <section className="activity-deck" aria-label="Пул агентов">
        <div className="activity-heading">
          <span aria-hidden="true">›_</span>
          <div><b>ПУЛ АГЕНТОВ</b><small>все специалисты, включая резерв</small></div>
        </div>
        <div className="activity-list">
          {state.agents.map((agent) => {
            const assignment = latestAssignmentByAgent.get(agent.id);
            return (
              <button
                type="button"
                key={agent.id}
                className={effectiveSelectedId === agent.id ? "active" : ""}
                onClick={() => setSelectedId(agent.id)}
              >
                <i style={{ background: roleColor(agent.role) }} />
                <span><strong>{agent.name}</strong><small>{assignment?.title ?? agent.task ?? "Без задачи"}</small></span>
                <em className={`mini-status mini-${agent.status}`}>{STATUS_META[agent.status].short}</em>
              </button>
            );
          })}
        </div>
      </section>

      <footer className="bureau-footer">
        <span>OBSERVER v0.2</span>
        <p>Интерфейс наблюдает за локальными событиями и не управляет агентами.</p>
        <span>{usingDemo ? "DEMO FEED" : "127.0.0.1:7331"}</span>
      </footer>
    </main>
  );
}
