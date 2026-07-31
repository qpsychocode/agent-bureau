"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type RefObject,
} from "react";
import demoState from "./demo-state.json";
import {
  CUSTOM_AGENT_LIMIT,
  matchLiveAgentsToRoster,
  parseCustomAgents,
  reserveUniqueAgentId,
  type CustomAgentDefinition,
  type OfficeKey,
} from "./agent-data";

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

type Presence = "demo" | "live" | "standby" | "custom";

type Review = {
  status?: string;
  verdict?: string;
  reviewer?: string;
  attempts?: number;
};

type Agent = {
  id: string;
  sourceId?: string;
  name: string;
  role: string;
  status: AgentStatus;
  presence?: Presence;
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
  customOffice?: OfficeKey;
  customAvatar?: OfficeKey;
  customPromptStored?: boolean;
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

type RoutedAssignment = TaskAssignment & { inferred?: boolean };

type BureauState = {
  version: number;
  project: string;
  runId?: string | null;
  mode: "live" | "demo";
  updatedAt: string;
  agents: Agent[];
  assignments?: TaskAssignment[];
};

type WorkerSlot =
  | "research"
  | "review"
  | "code"
  | "design"
  | "copy"
  | "marketing"
  | "image";
type StageSlot = "orchestrator" | WorkerSlot;

const DEMO_STATE = demoState as BureauState;
const COLLECTOR_URL = "http://127.0.0.1:7331/api/state";
const CUSTOM_AGENTS_STORAGE_KEY = "agent-bureau.custom-agents.v1";
const ROSTER_AGENT_IDS = new Set(DEMO_STATE.agents.map((agent) => agent.id));

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
  orchestrator: "#f3b662",
  coder: "#6fe0ae",
  designer: "#b59cff",
  image: "#ef8d70",
  reviewer: "#72cde9",
  copywriter: "#f1cf72",
  marketing: "#ef8eac",
  researcher: "#68d2c8",
  agent: "#b5bbca",
};

const ROLE_SPRITES: Record<string, string> = {
  orchestrator: "/agents/orchestrator.png",
  researcher: "/agents/researcher.png",
  coder: "/agents/coder.png",
  reviewer: "/agents/reviewer.png",
  designer: "/agents/designer.png",
  copywriter: "/agents/copywriter.png",
  marketing: "/agents/marketing.png",
  image: "/agents/image.png",
};

const OFFICE_TEMPLATES: Array<{
  key: OfficeKey;
  label: string;
  description: string;
  image: string;
}> = [
  { key: "orchestrator", label: "Командный", description: "Стратегия и раздача задач", image: "/offices/orchestrator.webp" },
  { key: "researcher", label: "Архив", description: "Поиск и проверка источников", image: "/offices/researcher.webp" },
  { key: "reviewer", label: "QA-лаборатория", description: "Верификация результата", image: "/offices/reviewer.webp" },
  { key: "coder", label: "Разработка", description: "Код, тесты и сборки", image: "/offices/coder.webp" },
  { key: "designer", label: "Дизайн-студия", description: "Интерфейсы и система визуала", image: "/offices/designer.webp" },
  { key: "copywriter", label: "Редакция", description: "Тексты и сценарии", image: "/offices/copywriter.webp" },
  { key: "marketing", label: "Маркетинг", description: "Кампании и аналитика", image: "/offices/marketing.webp" },
  { key: "image", label: "Иллюстраторская", description: "Изображения и арт", image: "/offices/image.webp" },
];

const AVATAR_OPTIONS = OFFICE_TEMPLATES.map((office) => ({
  key: office.key,
  label: ROLE_LABELS[office.key] ?? office.label,
  image: ROLE_SPRITES[office.key],
}));

const STAGE_SLOTS: Record<
  StageSlot,
  { x: number; y: number; width: number; height: number; label: string }
> = {
  orchestrator: { x: 42, y: 6, width: 34, height: 47, label: "Командный кабинет" },
  research: { x: 27, y: 9, width: 15, height: 44, label: "Архив исследователя" },
  review: { x: 76, y: 9, width: 24, height: 44, label: "QA-лаборатория" },
  code: { x: 0, y: 55, width: 20, height: 41, label: "Кабинет разработки" },
  design: { x: 20, y: 55, width: 19, height: 41, label: "Дизайн-студия" },
  copy: { x: 39, y: 55, width: 20, height: 41, label: "Редакция" },
  marketing: { x: 59, y: 55, width: 21, height: 41, label: "Маркетинг-кабинет" },
  image: { x: 80, y: 55, width: 20, height: 41, label: "Иллюстраторская" },
};

const WORKER_SLOTS: WorkerSlot[] = [
  "research",
  "review",
  "code",
  "design",
  "copy",
  "marketing",
  "image",
];

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
        typeof agent.role === "string" &&
        isAgentStatus(agent.status)
      );
    })
    .slice(0, 200)
    .map((agent) => ({ ...agent, presence: "live" as const, sourceId: agent.id }));

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
    project: typeof candidate.project === "string" ? candidate.project : "Agent Bureau",
    runId: typeof candidate.runId === "string" ? candidate.runId : null,
    mode: "live",
    updatedAt:
      typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date().toISOString(),
    agents,
    assignments,
  };
}

function roleKey(role: string) {
  const normalized = role.trim().toLowerCase();
  if (normalized.includes("orchestrat") || normalized.includes("оркестр")) return "orchestrator";
  if (
    normalized.includes("review") ||
    normalized.includes("verif") ||
    normalized.includes("вериф") ||
    normalized.includes("провер")
  ) return "reviewer";
  if (normalized.includes("design") || normalized.includes("дизайн")) return "designer";
  if (
    normalized.includes("image") ||
    normalized.includes("illustr") ||
    normalized.includes("иллюстр")
  ) return "image";
  if (
    normalized.includes("copy") ||
    normalized.includes("writer") ||
    normalized.includes("копирай")
  ) return "copywriter";
  if (normalized.includes("market") || normalized.includes("маркет")) return "marketing";
  if (
    normalized.includes("research") ||
    normalized.includes("исслед") ||
    normalized.includes("ресерч")
  ) return "researcher";
  if (
    normalized.includes("code") ||
    normalized.includes("develop") ||
    normalized.includes("разработ") ||
    normalized.includes("кодер")
  ) return "coder";
  return normalized || "agent";
}

function roleLabel(role: string) {
  return ROLE_LABELS[roleKey(role)] ?? role ?? "Специалист";
}

function roleColor(role: string) {
  return ROLE_COLORS[roleKey(role)] ?? ROLE_COLORS.agent;
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function spriteFor(agent: Agent) {
  if (agent.customAvatar && ROLE_SPRITES[agent.customAvatar]) {
    return ROLE_SPRITES[agent.customAvatar];
  }
  const key = roleKey(agent.role);
  if (ROLE_SPRITES[key]) return ROLE_SPRITES[key];
  const fallbacks = ["coder", "designer", "copywriter", "marketing", "image"];
  return ROLE_SPRITES[fallbacks[stableHash(`${agent.id}:${agent.role}`) % fallbacks.length]];
}

function customDefinitionToAgent(definition: CustomAgentDefinition): Agent {
  const office = OFFICE_TEMPLATES.find((item) => item.key === definition.officeKey);
  return {
    id: definition.id,
    name: definition.name,
    role: definition.avatarKey,
    status: "idle",
    presence: "custom",
    task: "Готов к подключению runtime",
    summary: `Кастомный профиль · ${office?.label ?? "цифровой кабинет"}`,
    model: "runtime не подключён",
    effort: "из system prompt",
    progress: 0,
    elapsedSeconds: 0,
    stale: false,
    customOffice: definition.officeKey,
    customAvatar: definition.avatarKey,
    customPromptStored: true,
  };
}

function mergeLiveWithRoster(live: BureauState): BureauState {
  const sourceToRoster = new Map<string, string>();
  const matching = matchLiveAgentsToRoster(DEMO_STATE.agents, live.agents, roleKey);

  const roster = DEMO_STATE.agents.map<Agent>((base, rosterIndex) => {
    const liveIndex = matching.byRoster.get(rosterIndex);
    const liveAgent = liveIndex === undefined ? undefined : live.agents[liveIndex];

    if (liveAgent) {
      sourceToRoster.set(liveAgent.id, base.id);
      return {
        ...base,
        ...liveAgent,
        id: base.id,
        sourceId: liveAgent.id,
        presence: "live",
      };
    }

    return {
      ...base,
      status: "idle",
      presence: "standby",
      taskId: undefined,
      task: "Ждёт живого назначения",
      summary: "Постоянный состав бюро; живого события пока нет",
      phase: undefined,
      progress: 0,
      startedAt: undefined,
      completedAt: undefined,
      updatedAt: live.updatedAt,
      elapsedSeconds: 0,
      stale: false,
      review: undefined,
    };
  });

  const usedOutputIds = new Set(roster.map((agent) => agent.id));
  const extras = matching.extraIndexes
    .map<Agent>((liveIndex) => {
      const agent = live.agents[liveIndex];
      const outputId = reserveUniqueAgentId(agent.id, usedOutputIds);
      if (!sourceToRoster.has(agent.id)) sourceToRoster.set(agent.id, outputId);
      return { ...agent, id: outputId, sourceId: agent.id, presence: "live" };
    });

  const validIds = new Set([...roster, ...extras].map((agent) => agent.id));
  const assignments = (live.assignments ?? [])
    .map((assignment) => ({
      ...assignment,
      fromAgentId: assignment.fromAgentId
        ? sourceToRoster.get(assignment.fromAgentId) ?? assignment.fromAgentId
        : undefined,
      toAgentId: sourceToRoster.get(assignment.toAgentId) ?? assignment.toAgentId,
    }))
    .filter((assignment) => validIds.has(assignment.toAgentId));

  return {
    ...live,
    agents: [...roster, ...extras],
    assignments,
    mode: "live",
  };
}

function preferredSlot(agent: Agent): WorkerSlot | null {
  const key = roleKey(agent.role);
  if (key === "researcher") return "research";
  if (key === "coder") return "code";
  if (key === "reviewer") return "review";
  if (key === "designer") return "design";
  if (key === "copywriter") return "copy";
  if (key === "marketing") return "marketing";
  if (key === "image") return "image";
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
  return { idle: 0, planning: 18, working: 54, reviewing: 78, revision: 66, blocked: 42, done: 100 }[
    agent.status
  ];
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
  if (!value) return "не указано";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "не указано";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildAssignments(state: BureauState, orchestrator?: Agent): RoutedAssignment[] {
  const explicit = [...(state.assignments ?? [])].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
  const explicitRecipients = new Set(explicit.map((item) => item.toAgentId));
  const inferred = state.agents
    .filter(
      (agent) =>
        agent.id !== orchestrator?.id &&
        agent.presence !== "standby" &&
        agent.status !== "idle" &&
        Boolean(agent.task) &&
        !explicitRecipients.has(agent.id),
    )
    .map<RoutedAssignment>((agent) => ({
      id: `inferred:${agent.taskId ?? agent.id}`,
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
  const orchestrator = agents.find((agent) => roleKey(agent.role) === "orchestrator");
  const candidates = agents.filter((agent) => agent.id !== orchestrator?.id);
  const occupants: Partial<Record<WorkerSlot, Agent>> = {};
  const remaining = [...candidates];

  for (const slot of WORKER_SLOTS) {
    const index = remaining.findIndex((agent) => preferredSlot(agent) === slot);
    if (index >= 0) occupants[slot] = remaining.splice(index, 1)[0];
  }
  return { orchestrator, occupants, overflow: remaining };
}

function AgentSprite({ agent }: { agent: Agent }) {
  const style = {
    "--role-accent": roleColor(agent.role),
    "--agent-delay": `${stableHash(agent.id) % 700}ms`,
  } as CSSProperties;

  return (
    <span className="agent-figure" style={style} aria-hidden="true">
      <span className="sprite-shadow" />
      <span className="sprite-motion">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="agent-sprite-image" src={spriteFor(agent)} alt="" draggable={false} />
        <i className="sprite-beacon" />
        {agent.status === "working" && <i className="work-pixels"><b /><b /><b /></i>}
        {agent.status === "reviewing" && <i className="review-scan" />}
      </span>
    </span>
  );
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
      className={`agent-hotspot hotspot-${slot} status-${agent.status} presence-${agent.presence ?? "demo"}${
        selected ? " is-selected" : ""
      }`}
      style={style}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${agent.name}, ${meta.label}. ${assignment?.title ?? agent.task ?? "Без задачи"}`}
      title={`${coordinates.label}: открыть карточку ${agent.name}`}
    >
      <span className="hotspot-aura" aria-hidden="true" />
      <AgentSprite agent={agent} />
      <span className="agent-label">
        <i aria-hidden="true" />
        <span>
          <strong>{agent.name}</strong>
          <small>
            {slot === "orchestrator"
              ? agent.presence === "standby" ? "уровень 01 · standby" : "уровень 01 · раздаёт ↓"
              : `уровень 02 · ${assignment?.taskId ?? meta.short}`}
          </small>
        </span>
      </span>
    </button>
  );
}

function AgentBuilder({
  existing,
  onCreate,
  onClose,
}: {
  existing: CustomAgentDefinition[];
  onCreate: (definition: CustomAgentDefinition) => void;
  onClose: () => void;
}) {
  const [officeKey, setOfficeKey] = useState<OfficeKey>("coder");
  const [avatarKey, setAvatarKey] = useState<OfficeKey>("coder");
  const [systemPrompt, setSystemPrompt] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const dialog = dialogRef.current;
    dialog?.focus();

    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeys);
    return () => {
      document.removeEventListener("keydown", handleKeys);
      previousFocus?.focus();
    };
  }, []);

  const office = OFFICE_TEMPLATES.find((item) => item.key === officeKey) ?? OFFICE_TEMPLATES[0];
  const avatar = AVATAR_OPTIONS.find((item) => item.key === avatarKey) ?? AVATAR_OPTIONS[0];
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = systemPrompt.trim();
    if (prompt.length < 12) return;
    const sameAvatarCount = existing.filter((item) => item.avatarKey === avatarKey).length;
    const baseName = ROLE_LABELS[avatarKey] ?? "Агент";
    const suffix = sameAvatarCount + 2;
    onCreate({
      id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: `${baseName} ${suffix}`,
      officeKey,
      avatarKey,
      systemPrompt: prompt.slice(0, 6_000),
      createdAt: new Date().toISOString(),
    });
    onClose();
  };

  return (
    <div className="builder-layer">
      <button type="button" className="builder-scrim" onClick={onClose} aria-label="Закрыть конструктор" />
      <div
        ref={dialogRef}
        className="agent-builder"
        role="dialog"
        aria-modal="true"
        aria-labelledby="builder-title"
        tabIndex={-1}
      >
        <button type="button" className="builder-close" onClick={onClose} aria-label="Закрыть конструктор">×</button>
        <header className="builder-header">
          <span>КОНСТРУКТОР ПРОФИЛЯ</span>
          <h2 id="builder-title">Новый агент</h2>
          <p>Кабинет + аватар + system prompt. Код проекта менять не нужно.</p>
        </header>

        <form onSubmit={submit}>
          <section className="builder-section">
            <div className="builder-step"><b>01</b><span>Выбери кабинет</span></div>
            <div className="office-picker">
              {OFFICE_TEMPLATES.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  className={officeKey === item.key ? "active" : ""}
                  onClick={() => setOfficeKey(item.key)}
                  aria-pressed={officeKey === item.key}
                  title={item.description}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image} alt="" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="builder-section builder-middle">
            <div>
              <div className="builder-step"><b>02</b><span>Выбери аватар</span></div>
              <div className="avatar-picker">
                {AVATAR_OPTIONS.map((item) => (
                  <button
                    type="button"
                    key={item.key}
                    className={avatarKey === item.key ? "active" : ""}
                    onClick={() => setAvatarKey(item.key)}
                    aria-pressed={avatarKey === item.key}
                    title={item.label}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.image} alt="" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="builder-preview" aria-label={`Предпросмотр: ${avatar.label}, ${office.label}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="preview-office" src={office.image} alt="" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="preview-agent" src={avatar.image} alt="" />
              <span><b>{avatar.label}</b><small>{office.label}</small></span>
            </div>
          </section>

          <section className="builder-section">
            <label className="builder-step" htmlFor="system-prompt"><b>03</b><span>System prompt</span></label>
            <textarea
              id="system-prompt"
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
              maxLength={6_000}
              rows={7}
              placeholder="Ты — специализированный агент… Твоя задача… Критерии готовности…"
              required
            />
            <div className="builder-submit-row">
              <p><i>◆</i> Prompt хранится только в localStorage этого браузера и не попадает в телеметрию.</p>
              <span>{systemPrompt.length}/6000</span>
              <button type="submit" disabled={systemPrompt.trim().length < 12}>+ СФОРМИРОВАТЬ АГЕНТА</button>
            </div>
          </section>
        </form>
      </div>
    </div>
  );
}

function AssignmentInspector({
  agent,
  assignment,
  source,
  onClose,
  onDelete,
  dialogRef,
}: {
  agent: Agent;
  assignment?: RoutedAssignment;
  source?: Agent;
  onClose: () => void;
  onDelete?: () => void;
  dialogRef: RefObject<HTMLElement | null>;
}) {
  const [deleteArmed, setDeleteArmed] = useState(false);
  const isOrchestrator = roleKey(agent.role) === "orchestrator";
  const progress = progressFor(agent);
  const style = { "--role-accent": roleColor(agent.role) } as CSSProperties;
  const assignmentLabel = assignment
    ? ASSIGNMENT_META[assignment.status]
    : agent.presence === "standby"
      ? "Standby"
      : STATUS_META[agent.status].label;
  const customOffice = agent.customOffice
    ? OFFICE_TEMPLATES.find((item) => item.key === agent.customOffice)
    : undefined;

  return (
    <aside
      ref={dialogRef}
      className="inspector"
      style={style}
      role="dialog"
      aria-modal="true"
      aria-labelledby="inspector-title"
      tabIndex={-1}
    >
      <button type="button" className="inspector-close" onClick={onClose} aria-label="Закрыть карточку">
        ×
      </button>
      <div className="inspector-topline">
        <span className="inspector-kicker">
          {isOrchestrator ? "ЦЕНТР УПРАВЛЕНИЯ" : "НАЗНАЧЕНИЕ ОТ ОРКЕСТРАТОРА"}
        </span>
        <span className={`status-pill status-pill-${agent.status}`}><i />{assignmentLabel}</span>
      </div>

      <div className="route-title">
        <span>{isOrchestrator ? "СТРАТЕГИЯ" : source?.name ?? "Внешняя очередь"}</span>
        <b aria-hidden="true">{isOrchestrator ? "⌁" : "→"}</b>
        <span>{isOrchestrator ? "ИСПОЛНИТЕЛИ" : agent.name}</span>
      </div>

      <div className="identity-line">
        <div className="identity-beacon" aria-hidden="true"><i /></div>
        <div><h2 id="inspector-title">{agent.name}</h2><p>{roleLabel(agent.role)}</p></div>
      </div>

      {agent.stale && <div className="stale-warning">Сигнал давно не обновлялся.</div>}

      {customOffice && (
        <>
          <section className="custom-office-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="custom-office-bg" src={customOffice.image} alt="" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="custom-office-agent" src={spriteFor(agent)} alt="" />
            <div><span>ЦИФРОВОЙ КАБИНЕТ</span><b>{customOffice.label}</b><small>System prompt сохранён локально</small></div>
          </section>
          {onDelete && (
            <button
              type="button"
              className={`delete-custom-agent${deleteArmed ? " is-armed" : ""}`}
              onClick={() => deleteArmed ? onDelete() : setDeleteArmed(true)}
            >
              {deleteArmed ? "Нажми ещё раз — удалить" : "Удалить локальный профиль"}
            </button>
          )}
        </>
      )}

      <section className="task-card">
        <div className="task-card-heading">
          <span>{isOrchestrator ? "ТЕКУЩАЯ ЦЕЛЬ" : "ПЕРЕДАННАЯ ЗАДАЧА"}</span>
          <code>{assignment?.taskId ?? agent.taskId ?? "STANDBY"}</code>
        </div>
        <h3>{assignment?.title ?? agent.task ?? "Ожидает назначения"}</h3>
        <p>{assignment?.summary ?? agent.summary ?? "Безопасное резюме пока не поступило."}</p>
      </section>

      {assignment?.inferred && (
        <p className="inference-note">Маршрут восстановлен по текущей задаче агента.</p>
      )}

      <section className="progress-block">
        <div><span>Фаза: {agent.phase?.replace(/^tool:/, "") || STATUS_META[agent.status].short}</span><strong>{progress}%</strong></div>
        <div className="progress-track" aria-label={`Прогресс ${progress}%`}><i style={{ width: `${progress}%` }} /></div>
      </section>

      <dl className="detail-grid">
        <div><dt>Модель</dt><dd>{agent.model || "не указана"}</dd></div>
        <div><dt>Reasoning</dt><dd>{agent.effort || "по умолчанию"}</dd></div>
        <div><dt>В работе</dt><dd>{formatDuration(agent.elapsedSeconds)}</dd></div>
        <div><dt>Передано</dt><dd>{formatMoment(assignment?.assignedAt ?? agent.startedAt)}</dd></div>
      </dl>

      {agent.review && (
        <section className="review-card">
          <div><span>ВЕРИФИКАЦИЯ</span><b>{agent.review.status || "в процессе"}</b></div>
          <p>{agent.review.verdict || "Результат ещё проверяется."}</p>
          <small>Проверяющий: {agent.review.reviewer || "не назначен"} · попытка {agent.review.attempts ?? 1}</small>
        </section>
      )}

      <div className="privacy-note"><i aria-hidden="true">◆</i><p>Только безопасное резюме: без промптов, файлов и внутренних рассуждений.</p></div>
    </aside>
  );
}

export default function Home() {
  const [liveState, setLiveState] = useState<BureauState | null>(null);
  const [connection, setConnection] = useState<"connecting" | "live" | "offline">("connecting");
  const [viewMode, setViewMode] = useState<"live" | "demo">("live");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [customDefinitions, setCustomDefinitions] = useState<CustomAgentDefinition[]>([]);
  const [customDefinitionsLoaded, setCustomDefinitionsLoaded] = useState(false);
  const [clock, setClock] = useState<Date | null>(null);
  const inspectorRef = useRef<HTMLElement>(null);

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
    const restore = window.setTimeout(() => {
      setCustomDefinitions(parseCustomAgents(
        window.localStorage.getItem(CUSTOM_AGENTS_STORAGE_KEY),
        ROSTER_AGENT_IDS,
      ));
      setCustomDefinitionsLoaded(true);
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  useEffect(() => {
    if (!customDefinitionsLoaded) return;
    try {
      window.localStorage.setItem(
        CUSTOM_AGENTS_STORAGE_KEY,
        JSON.stringify(customDefinitions.slice(-CUSTOM_AGENT_LIMIT)),
      );
    } catch {
      // A blocked or full localStorage must not break the observer UI.
    }
  }, [customDefinitions, customDefinitionsLoaded]);

  useEffect(() => {
    const syncAcrossTabs = (event: StorageEvent) => {
      if (event.key === CUSTOM_AGENTS_STORAGE_KEY) {
        setCustomDefinitions(parseCustomAgents(event.newValue, ROSTER_AGENT_IDS));
      }
    };
    window.addEventListener("storage", syncAcrossTabs);
    return () => window.removeEventListener("storage", syncAcrossTabs);
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
  const mergedLiveState = useMemo(
    () => (liveState ? mergeLiveWithRoster(liveState) : null),
    [liveState],
  );
  const usingDemo = viewMode === "demo" || !hasLiveAgents;
  const state = usingDemo ? DEMO_STATE : (mergedLiveState as BureauState);
  const agents = useMemo(
    () => [
      ...state.agents.map((agent) => ({ ...agent, presence: agent.presence ?? "demo" })),
      ...customDefinitions
        .filter((definition) => !state.agents.some((agent) => agent.id === definition.id))
        .map(customDefinitionToAgent),
    ],
    [customDefinitions, state.agents],
  );
  const stage = useMemo(() => arrangeStage(agents), [agents]);
  const assignments = useMemo(
    () => buildAssignments({ ...state, agents }, stage.orchestrator),
    [agents, stage.orchestrator, state],
  );
  const latestAssignmentByAgent = useMemo(() => {
    const result = new Map<string, RoutedAssignment>();
    for (const assignment of assignments) {
      if (!result.has(assignment.toAgentId)) result.set(assignment.toAgentId, assignment);
    }
    return result;
  }, [assignments]);

  const selectedAgent = agents.find((agent) => agent.id === selectedId);
  const selectedAssignment = selectedAgent
    ? latestAssignmentByAgent.get(selectedAgent.id)
    : undefined;
  const assignmentSource = selectedAssignment?.fromAgentId
    ? agents.find((agent) => agent.id === selectedAssignment.fromAgentId)
    : stage.orchestrator;
  const liveCount = agents.filter((agent) => agent.presence === "live").length;
  const standbyCount = agents.filter((agent) => agent.presence === "standby").length;
  const customCount = agents.filter((agent) => agent.presence === "custom").length;
  const activeCount = agents.filter((agent) => ACTIVE_STATUSES.has(agent.status)).length;

  useEffect(() => {
    if (!selectedId) return;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const dialog = inspectorRef.current;
    dialog?.focus();

    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedId(null);
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleDialogKeys);
    return () => {
      document.removeEventListener("keydown", handleDialogKeys);
      previousFocus?.focus();
    };
  }, [selectedId]);

  const toggleMode = () => {
    if (!hasLiveAgents) return;
    setSelectedId(null);
    setViewMode((mode) => (mode === "live" ? "demo" : "live"));
  };

  const createCustomAgent = (definition: CustomAgentDefinition) => {
    setCustomDefinitions((current) => [
      ...current.slice(-(CUSTOM_AGENT_LIMIT - 1)),
      definition,
    ]);
    setSelectedId(definition.id);
  };

  const deleteCustomAgent = (agent: Agent) => {
    setCustomDefinitions((current) => current.filter((item) => item.id !== agent.id));
    setSelectedId(null);
  };

  return (
    <main className="bureau-shell">
      <div className="page-noise" aria-hidden="true" />
      <h1 className="visually-hidden">Агентское бюро — ЖИВОЙ ОФИС</h1>
      <p className="visually-hidden">МАРШРУТЫ ЗАДАЧ · НАЗНАЧЕНИЕ ОТ ОРКЕСТРАТОРА · ПУЛ АГЕНТОВ</p>

      <section className="scene-scroll" aria-label="Живой офис Агентского бюро">
        <figure className="office-stage">
          {/* The empty office is the environment layer. Every agent is rendered
              separately below so live roster changes can animate into the scene. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="office-art"
            src="/office-departments-v3.png"
            alt="Пиксельный интерьер Агентского бюро с восемью отдельными ролевыми кабинетами"
            width={1672}
            height={941}
          />
          <div className="stage-vignette" aria-hidden="true" />

          <svg className="hierarchy-network" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path className="route-path route-research" d="M 59 43 V 51 H 34 V 46" />
            <path className="route-path route-review" d="M 59 43 V 51 H 88 V 46" />
            <path className="route-path route-code" d="M 59 43 V 53 H 10 V 59" />
            <path className="route-path route-design" d="M 59 43 V 53 H 29 V 59" />
            <path className="route-path route-copy" d="M 59 43 V 59" />
            <path className="route-path route-marketing" d="M 59 43 V 53 H 69 V 59" />
            <path className="route-path route-image" d="M 59 43 V 53 H 90 V 59" />
          </svg>

          {stage.orchestrator && (
            <AgentHotspot
              agent={stage.orchestrator}
              slot="orchestrator"
              selected={selectedId === stage.orchestrator.id}
              onSelect={() => setSelectedId(stage.orchestrator?.id ?? null)}
            />
          )}

          {WORKER_SLOTS.map((slot) => {
            const agent = stage.occupants[slot];
            if (!agent) return null;
            return (
              <AgentHotspot
                key={agent.id}
                agent={agent}
                slot={slot}
                assignment={latestAssignmentByAgent.get(agent.id)}
                selected={selectedId === agent.id}
                onSelect={() => setSelectedId(agent.id)}
              />
            );
          })}

          {WORKER_SLOTS.map((slot) => {
            const agent = stage.occupants[slot];
            const assignment = agent ? latestAssignmentByAgent.get(agent.id) : undefined;
            if (!agent || !assignment) return null;
            return (
              <button
                key={`task-packet-${assignment.id}`}
                type="button"
                className={`task-packet packet-${slot}${selectedId === agent.id ? " is-selected" : ""}`}
                onClick={() => setSelectedId(agent.id)}
                aria-label={`Открыть задачу ${assignment.title}, переданную агенту ${agent.name}`}
                title={`${assignment.taskId ?? "TASK"}: ${assignment.title}`}
              >
                <i aria-hidden="true">◆</i><span>{assignment.taskId ?? "TASK"}</span>
              </button>
            );
          })}

          {stage.overflow.length > 0 && (
            <button
              type="button"
              className="overflow-counter"
              onClick={() => setSelectedId(stage.overflow[0]?.id ?? null)}
            >
              +{stage.overflow.length} в цифровом аннексе
            </button>
          )}
        </figure>
      </section>

      <header className="observer-hud">
        <div className="hud-brand"><span>OBSERVER</span><b>v0.5</b></div>
        <button
          type="button"
          className="mode-switch"
          onClick={toggleMode}
          disabled={!hasLiveAgents}
          title={hasLiveAgents ? "Переключить live и demo" : "Collector недоступен — показан demo-режим"}
        >
          <i className={`connection-dot ${connection}`} />
          <span><b>{usingDemo ? "DEMO" : "LIVE"}</b><small>{usingDemo ? `${agents.length} агентов` : `${liveCount} live · ${standbyCount} standby${customCount ? ` · ${customCount} custom` : ""}`}</small></span>
        </button>
        <div className="hud-project"><small>ПРОЕКТ</small><strong>{state.project}</strong></div>
        <div className="hud-stat"><strong>{activeCount}</strong><small>активны</small></div>
        <time dateTime={clock?.toISOString()}>{clock ? formatClock(clock) : "--:--:--"}</time>
      </header>

      <div className="scene-hint" aria-hidden="true"><span>↘</span> нажми на агента или пакет</div>

      <nav className="crew-dock" aria-label="Пул агентов">
        <span className="dock-title"><i>›_</i><b>КОМАНДА</b></span>
        <div className="dock-agents">
          {agents.map((agent) => {
            const assignment = latestAssignmentByAgent.get(agent.id);
            return (
              <button
                type="button"
                key={agent.id}
                className={`${selectedId === agent.id ? "active " : ""}presence-${agent.presence}`}
                onClick={() => setSelectedId(agent.id)}
                title={assignment?.title ?? agent.task ?? "Без задачи"}
              >
                <i className={`crew-signal status-${agent.status}`} style={{ "--role-accent": roleColor(agent.role) } as CSSProperties} />
                <span><strong>{agent.name}</strong><small>{agent.presence === "standby" ? "standby" : STATUS_META[agent.status].short}</small></span>
              </button>
            );
          })}
          <button
            type="button"
            className="add-agent-button"
            onClick={() => {
              setSelectedId(null);
              setBuilderOpen(true);
            }}
          >
            <i>+</i><span><strong>Добавить агента</strong><small>кабинет · аватар · prompt</small></span>
          </button>
        </div>
      </nav>

      {selectedAgent && (
        <>
          <button type="button" className="drawer-scrim" onClick={() => setSelectedId(null)} aria-label="Закрыть карточку" />
          <AssignmentInspector
            agent={selectedAgent}
            assignment={selectedAssignment}
            source={assignmentSource}
            onClose={() => setSelectedId(null)}
            onDelete={selectedAgent.presence === "custom" ? () => deleteCustomAgent(selectedAgent) : undefined}
            dialogRef={inspectorRef}
          />
        </>
      )}

      {builderOpen && (
        <AgentBuilder
          existing={customDefinitions}
          onCreate={createCustomAgent}
          onClose={() => setBuilderOpen(false)}
        />
      )}
    </main>
  );
}
