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
  REASONING_SUGGESTIONS,
  migrateLegacyAgentProfiles,
  matchLiveAgentsToRoster,
  normalizeRuntimeProfile,
  parseAgentProfileStore,
  parseCustomAgents,
  parseRuntimeProviders,
  reserveUniqueAgentId,
  serializeAgentProfileStore,
  type CustomAgentDefinition,
  type OfficeKey,
  type ReasoningLevel,
  type RuntimeProfile,
  type RuntimeProviderDefinition,
} from "./agent-data";
import runtimeProvidersRaw from "../config/runtime-providers.json";

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
  customRoleTitle?: string;
  customPromptStored?: boolean;
  customRuntime?: RuntimeProfile;
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
const AGENT_PROFILES_STORAGE_KEY = "agent-bureau.agent-profiles.v2";
const LEGACY_CUSTOM_AGENTS_STORAGE_KEY = "agent-bureau.custom-agents.v1";
const ROSTER_AGENT_IDS = new Set(DEMO_STATE.agents.map((agent) => agent.id));
const FALLBACK_RUNTIME_PROVIDER: RuntimeProviderDefinition = {
  id: "custom",
  label: "Custom runtime",
  badge: "CUSTOM",
  adapterId: "custom-adapter",
  adapterMode: "editable",
  description: "Your own CLI, SDK, or local bridge",
  setupHint: "Implement and trust this adapter locally before trying to run the profile.",
  modelPlaceholder: "Model ID supported by your runtime",
  defaultReasoning: "provider-default",
  endpointMode: "optional",
  credentialEnvMode: "optional",
  credentialEnv: "",
};
const parsedRuntimeProviders = parseRuntimeProviders(runtimeProvidersRaw);
const RUNTIME_PROVIDERS = parsedRuntimeProviders.length
  ? parsedRuntimeProviders
  : [FALLBACK_RUNTIME_PROVIDER];

const STATUS_META: Record<AgentStatus, { label: string; short: string }> = {
  idle: { label: "Available", short: "standby" },
  planning: { label: "Planning", short: "planning" },
  working: { label: "Working", short: "working" },
  reviewing: { label: "Reviewing", short: "review" },
  revision: { label: "Revising", short: "revision" },
  blocked: { label: "Blocked", short: "blocked" },
  done: { label: "Done", short: "done" },
};

const ASSIGNMENT_META: Record<AssignmentStatus, string> = {
  assigned: "Assigned",
  working: "In progress",
  reviewing: "In review",
  revision: "Needs revision",
  blocked: "Blocked",
  done: "Completed",
};

const ROLE_LABELS: Record<string, string> = {
  orchestrator: "Orchestrator",
  coder: "Developer",
  designer: "Designer",
  image: "Illustrator",
  reviewer: "Verifier",
  copywriter: "Copywriter",
  marketing: "Marketer",
  researcher: "Researcher",
  agent: "Specialist",
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

const GAZE_LAYOUTS: Record<string, {
  width: number;
  height: number;
  eyes: Array<[number, number, number, number]>;
}> = {
  orchestrator: { width: 261, height: 303, eyes: [[101, 83, 13, 23], [145, 83, 13, 23]] },
  researcher: { width: 239, height: 306, eyes: [[88, 84, 14, 22], [131, 84, 14, 22]] },
  reviewer: { width: 249, height: 312, eyes: [[98, 95, 12, 22], [137, 94, 14, 23]] },
  coder: { width: 297, height: 316, eyes: [[94, 97, 13, 24], [136, 97, 13, 24]] },
  designer: { width: 249, height: 334, eyes: [[114, 122, 13, 21], [150, 122, 13, 21]] },
  copywriter: { width: 239, height: 319, eyes: [[101, 87, 13, 22], [142, 87, 13, 22]] },
  marketing: { width: 229, height: 315, eyes: [[88, 94, 13, 22], [130, 94, 13, 22]] },
  image: { width: 246, height: 321, eyes: [[98, 100, 12, 23], [137, 100, 13, 23]] },
};

const OFFICE_TEMPLATES: Array<{
  key: OfficeKey;
  label: string;
  description: string;
  image: string;
}> = [
  { key: "orchestrator", label: "Command Room", description: "Strategy and task dispatch", image: "/offices/orchestrator.webp" },
  { key: "researcher", label: "Research Archive", description: "Research and source verification", image: "/offices/researcher.webp" },
  { key: "reviewer", label: "QA Lab", description: "Independent result verification", image: "/offices/reviewer.webp" },
  { key: "coder", label: "Development", description: "Code, tests, and builds", image: "/offices/coder.webp" },
  { key: "designer", label: "Design Studio", description: "Interfaces and visual systems", image: "/offices/designer.webp" },
  { key: "copywriter", label: "Editorial", description: "Copy and narratives", image: "/offices/copywriter.webp" },
  { key: "marketing", label: "Marketing", description: "Campaigns and analytics", image: "/offices/marketing.webp" },
  { key: "image", label: "Illustration Studio", description: "Images and artwork", image: "/offices/image.webp" },
];

const AVATAR_OPTIONS = OFFICE_TEMPLATES.map((office) => ({
  key: office.key,
  label: ROLE_LABELS[office.key] ?? office.label,
  image: ROLE_SPRITES[office.key],
}));

function runtimeProviderFor(providerId: string) {
  return RUNTIME_PROVIDERS.find((provider) => provider.id === providerId) ?? {
    ...FALLBACK_RUNTIME_PROVIDER,
    id: providerId,
    label: providerId === "unconfigured" ? "Runtime not configured" : providerId,
  };
}

function hasRuntimeProvider(providerId: string) {
  return RUNTIME_PROVIDERS.some((provider) => provider.id === providerId);
}

const STAGE_SLOTS: Record<
  StageSlot,
  { x: number; y: number; width: number; height: number; label: string }
> = {
  orchestrator: { x: 42, y: 6, width: 34, height: 47, label: "Command Office" },
  research: { x: 27, y: 9, width: 15, height: 44, label: "Research Archive" },
  review: { x: 76, y: 9, width: 24, height: 44, label: "QA Lab" },
  code: { x: 0, y: 55, width: 20, height: 41, label: "Development Office" },
  design: { x: 20, y: 55, width: 19, height: 41, label: "Design Studio" },
  copy: { x: 39, y: 55, width: 20, height: 41, label: "Editorial Office" },
  marketing: { x: 59, y: 55, width: 21, height: 41, label: "Marketing Office" },
  image: { x: 80, y: 55, width: 20, height: 41, label: "Illustration Studio" },
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
  return ROLE_LABELS[roleKey(role)] ?? role ?? "Specialist";
}

function displayRole(agent: Agent) {
  return agent.customRoleTitle?.trim() || roleLabel(agent.role);
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

function spriteKeyFor(agent: Agent) {
  if (agent.customAvatar && ROLE_SPRITES[agent.customAvatar]) {
    return agent.customAvatar;
  }
  const key = roleKey(agent.role);
  if (ROLE_SPRITES[key]) return key;
  const fallbacks = ["coder", "designer", "copywriter", "marketing", "image"];
  return fallbacks[stableHash(`${agent.id}:${agent.role}`) % fallbacks.length];
}

function spriteFor(agent: Agent) {
  return ROLE_SPRITES[spriteKeyFor(agent)];
}

function customDefinitionToAgent(definition: CustomAgentDefinition): Agent {
  const office = OFFICE_TEMPLATES.find((item) => item.key === definition.officeKey);
  const provider = runtimeProviderFor(definition.runtime.providerId);
  const runtimeReady = definition.runtime.providerId !== "unconfigured" &&
    hasRuntimeProvider(definition.runtime.providerId);
  return {
    id: definition.id,
    name: definition.name,
    role: definition.avatarKey,
    status: "idle",
    presence: "custom",
    task: runtimeReady
      ? `Profile ready for ${provider.label}`
      : definition.runtime.providerId === "unconfigured"
        ? "Choose a runtime"
        : "Adapter unavailable in the current catalog",
    summary: `Custom profile · ${office?.label ?? "digital office"} · process not running`,
    model: runtimeReady ? `${provider.label} · ${definition.runtime.model}` : "not selected",
    effort: definition.runtime.reasoning,
    phase: runtimeReady ? `adapter:${definition.runtime.adapterId}` : "runtime:unconfigured",
    progress: 0,
    elapsedSeconds: 0,
    stale: false,
    customOffice: definition.officeKey,
    customAvatar: definition.avatarKey,
    customRoleTitle: definition.roleTitle,
    customPromptStored: true,
    customRuntime: definition.runtime,
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
        name: base.name,
        sourceId: liveAgent.id,
        presence: "live",
      };
    }

    return {
      ...base,
      status: "idle",
      presence: "standby",
      taskId: undefined,
      task: "Awaiting a live assignment",
      summary: "Core bureau roster; no live event yet",
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
  if (seconds < 60) return `${Math.max(0, seconds)} sec`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatMoment(value?: string) {
  if (!value) return "Not specified";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not specified";
  return new Intl.DateTimeFormat("en-US", {
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
      title: agent.task ?? "Current task",
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
  const gaze = GAZE_LAYOUTS[spriteKeyFor(agent)] ?? GAZE_LAYOUTS.coder;
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
        <svg
          className="gaze-up-layer"
          viewBox={`0 0 ${gaze.width} ${gaze.height}`}
          preserveAspectRatio="xMidYMax meet"
          shapeRendering="crispEdges"
          aria-hidden="true"
        >
          {gaze.eyes.map(([x, y, width, height], index) => (
            <g key={`${x}:${y}:${index}`}>
              <rect className="gaze-mask" x={x - 2} y={y - 2} width={width + 4} height={height + 4} />
              <rect className="gaze-eye" x={x} y={y - 7} width={width} height={height} />
            </g>
          ))}
        </svg>
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
      aria-label={`${agent.name}, ${meta.label}. ${assignment?.title ?? agent.task ?? "No task"}`}
      title={`${coordinates.label}: open ${agent.name}`}
    >
      <AgentSprite agent={agent} />
      <span className="agent-label">
        <i aria-hidden="true" />
        <span>
          <strong>{agent.name}</strong>
          <small>
            {slot === "orchestrator"
              ? agent.presence === "standby" ? "level 01 · standby" : "level 01 · dispatching ↓"
              : `level 02 · ${assignment?.taskId ?? meta.short}`}
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
  const initialProvider = RUNTIME_PROVIDERS[0] ?? FALLBACK_RUNTIME_PROVIDER;
  const [agentName, setAgentName] = useState("");
  const [roleTitle, setRoleTitle] = useState(ROLE_LABELS.coder);
  const [officeKey, setOfficeKey] = useState<OfficeKey>("coder");
  const [avatarKey, setAvatarKey] = useState<OfficeKey>("coder");
  const [providerId, setProviderId] = useState(initialProvider.id);
  const [adapterId, setAdapterId] = useState(initialProvider.adapterId);
  const [model, setModel] = useState("");
  const [reasoning, setReasoning] = useState<ReasoningLevel>(initialProvider.defaultReasoning);
  const [endpoint, setEndpoint] = useState("");
  const [credentialEnv, setCredentialEnv] = useState(initialProvider.credentialEnv);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [formError, setFormError] = useState("");
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
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
  const provider = runtimeProviderFor(providerId);
  const runtime = normalizeRuntimeProfile({
    providerId,
    adapterId,
    model,
    reasoning,
    ...(provider.endpointMode !== "none" && endpoint.trim() ? { endpoint } : {}),
    ...(provider.credentialEnvMode !== "none" && credentialEnv.trim() ? { credentialEnv } : {}),
  });
  const runtimeValid = Boolean(
    runtime &&
    (provider.endpointMode !== "required" || endpoint.trim()) &&
    (provider.credentialEnvMode !== "required" || credentialEnv.trim()) &&
    (provider.adapterMode !== "editable" || adapterId.trim()),
  );
  const identityValid = agentName.trim().length >= 2 && roleTitle.trim().length >= 2;
  const promptValid = systemPrompt.trim().length >= 12;
  const canCreate = identityValid && promptValid && runtimeValid;

  const chooseProvider = (nextProvider: RuntimeProviderDefinition) => {
    setProviderId(nextProvider.id);
    setAdapterId(nextProvider.adapterId);
    setModel("");
    setReasoning(nextProvider.defaultReasoning);
    setEndpoint("");
    setCredentialEnv(nextProvider.credentialEnvMode === "none" ? "" : nextProvider.credentialEnv);
    setFormError("");
  };

  const chooseAvatar = (nextAvatar: OfficeKey) => {
    const previousDefault = ROLE_LABELS[avatarKey] ?? "Specialist";
    setAvatarKey(nextAvatar);
    if (!roleTitle.trim() || roleTitle === previousDefault) {
      setRoleTitle(ROLE_LABELS[nextAvatar] ?? "Specialist");
    }
    setFormError("");
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = agentName.trim();
    const customRole = roleTitle.trim();
    const prompt = systemPrompt.trim();
    if (!canCreate || !runtime) {
      setFormError("Complete the agent name, specialty, model ID, runtime fields, and a system prompt of at least 12 characters.");
      return;
    }
    const nameSlug = name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "agent";
    const id = reserveUniqueAgentId(
      `custom-${nameSlug}-${Date.now().toString(36)}`,
      new Set([...ROSTER_AGENT_IDS, ...existing.map((item) => item.id)]),
    );
    onCreate({
      id,
      name,
      roleTitle: customRole,
      officeKey,
      avatarKey,
      runtime,
      systemPrompt: prompt.slice(0, 6_000),
      createdAt: new Date().toISOString(),
    });
    onClose();
  };

  return (
    <div className="builder-layer">
      <button type="button" className="builder-scrim" onClick={onClose} aria-label="Close profile builder" />
      <div
        ref={dialogRef}
        className="agent-builder"
        role="dialog"
        aria-modal="true"
        aria-labelledby="builder-title"
        tabIndex={-1}
      >
        <button type="button" className="builder-close" onClick={onClose} aria-label="Close profile builder"><span aria-hidden="true" /></button>
        <header className="builder-header">
          <span>PROFILE BUILDER</span>
          <h2 id="builder-title">New agent</h2>
          <p>Name + specialty + office + avatar + runtime + system prompt. Everything is saved locally.</p>
        </header>

        <form onSubmit={submit} noValidate>
          <section className="builder-section">
            <div className="builder-step"><b>01</b><span>Name your agent</span></div>
            <div className="identity-fields">
              <label>
                <span>Agent name <b>required</b></span>
                <input
                  id="agent-name"
                  value={agentName}
                  onChange={(event) => { setAgentName(event.target.value); setFormError(""); }}
                  maxLength={80}
                  placeholder="e.g. Atlas"
                  aria-invalid={Boolean(formError) && agentName.trim().length < 2}
                  autoFocus
                />
                <small>This is the name shown in Team and the inspector.</small>
              </label>
              <label>
                <span>Specialty / role <b>required</b></span>
                <input
                  id="agent-role"
                  value={roleTitle}
                  onChange={(event) => { setRoleTitle(event.target.value); setFormError(""); }}
                  maxLength={80}
                  placeholder="e.g. Growth researcher"
                  aria-invalid={Boolean(formError) && roleTitle.trim().length < 2}
                />
                <small>Write any role; the avatar is only its visual template.</small>
              </label>
            </div>
          </section>

          <section className="builder-section">
            <div className="builder-step"><b>02</b><span>Choose an office</span></div>
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
              <div className="builder-step"><b>03</b><span>Choose an avatar template</span></div>
              <div className="avatar-picker">
                {AVATAR_OPTIONS.map((item) => (
                  <button
                    type="button"
                    key={item.key}
                    className={avatarKey === item.key ? "active" : ""}
                    onClick={() => chooseAvatar(item.key)}
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

            <div className="builder-preview" aria-label={`Preview: ${avatar.label}, ${office.label}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="preview-office" src={office.image} alt="" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="preview-agent" src={avatar.image} alt="" />
              <span><b>{agentName.trim() || "Your agent"}</b><small>{roleTitle.trim() || avatar.label} · {office.label}</small></span>
            </div>
          </section>

          <section className="builder-section">
            <div className="builder-step"><b>04</b><span>Configure runtime</span></div>
            <div className="provider-picker">
              {RUNTIME_PROVIDERS.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={providerId === item.id ? "active" : ""}
                  onClick={() => chooseProvider(item)}
                  aria-pressed={providerId === item.id}
                >
                  <small>{item.badge}</small>
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </button>
              ))}
            </div>

            <div className="runtime-fields">
              <label>
                <span>Model ID <b>required</b></span>
                <input
                  id="runtime-model"
                  value={model}
                  onChange={(event) => { setModel(event.target.value); setFormError(""); }}
                  maxLength={160}
                  placeholder={provider.modelPlaceholder}
                  aria-invalid={Boolean(formError) && !model.trim()}
                />
                <small>Type or paste the exact model ID exposed by your local runtime.</small>
              </label>
              <label>
                <span>Reasoning / thinking</span>
                <select
                  id="runtime-reasoning"
                  value={reasoning}
                  onChange={(event) => setReasoning(event.target.value)}
                >
                  {REASONING_SUGGESTIONS.map((item) => (
                    <option key={item} value={item}>{item === "provider-default" ? "Provider default" : item}</option>
                  ))}
                </select>
                <small>Choose a supported effort level; no typing required.</small>
              </label>
              <label>
                <span>Adapter ID</span>
                <input
                  id="runtime-adapter"
                  value={adapterId}
                  onChange={(event) => setAdapterId(event.target.value)}
                  maxLength={80}
                  readOnly={provider.adapterMode === "fixed"}
                  required
                />
              </label>
              {provider.endpointMode !== "none" && (
                <label>
                  <span>Endpoint {provider.endpointMode === "required" && <b>required</b>}</span>
                  <input
                    id="runtime-endpoint"
                    type="url"
                    value={endpoint}
                    onChange={(event) => setEndpoint(event.target.value)}
                    maxLength={500}
                    placeholder="http://127.0.0.1:11434/v1"
                    required={provider.endpointMode === "required"}
                  />
                </label>
              )}
              {provider.credentialEnvMode !== "none" && (
                <label>
                  <span>
                    Environment variable <i>not the key</i>
                    {provider.credentialEnvMode === "required" && <b>required</b>}
                  </span>
                  <input
                    id="runtime-credential-env"
                    value={credentialEnv}
                    onChange={(event) => setCredentialEnv(event.target.value.toUpperCase())}
                    maxLength={100}
                    placeholder="MY_PROVIDER_API_KEY"
                    pattern="(?!NEXT_PUBLIC_|VITE_|PUBLIC_)[A-Z_][A-Z0-9_]*"
                    required={provider.credentialEnvMode === "required"}
                  />
                </label>
              )}
            </div>
            <div className="runtime-connection-note">
              <span>LOCAL CONNECTION REQUIRED</span>
              <strong>{provider.label} does not run inside this browser.</strong>
              <p>{provider.setupHint}</p>
            </div>
            <p className="runtime-safety"><i>◆</i> Configuration only. Never enter an API key here; the trusted local adapter reads the named environment variable.</p>
          </section>

          <section className="builder-section">
            <label className="builder-step" htmlFor="system-prompt"><b>05</b><span>System prompt</span></label>
            <textarea
              id="system-prompt"
              value={systemPrompt}
              onChange={(event) => { setSystemPrompt(event.target.value); setFormError(""); }}
              maxLength={6_000}
              rows={7}
              placeholder="You are a specialized agent… Your objective… Acceptance criteria…"
              aria-invalid={Boolean(formError) && !promptValid}
            />
            {formError && <p className="builder-error" role="alert">{formError}</p>}
            <div className="builder-submit-row">
              <p><i>◆</i> The prompt stays in this browser&apos;s localStorage and never enters telemetry.</p>
              <span>{systemPrompt.length}/6000</span>
              <button type="submit" className={canCreate ? "is-ready" : ""}>+ CREATE AGENT</button>
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
  const customProvider = agent.customRuntime
    ? runtimeProviderFor(agent.customRuntime.providerId)
    : undefined;
  const customProviderAvailable = agent.customRuntime
    ? hasRuntimeProvider(agent.customRuntime.providerId)
    : false;

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
      <button type="button" className="inspector-close" onClick={onClose} aria-label="Close agent details">
        <span aria-hidden="true" />
      </button>
      <div className="inspector-topline">
        <span className="inspector-kicker">
          {isOrchestrator ? "COMMAND CENTER" : "ASSIGNMENT FROM ORCHESTRATOR"}
        </span>
        <span className={`status-pill status-pill-${agent.status}`}><i />{assignmentLabel}</span>
      </div>

      <div className="route-title">
        <span>{isOrchestrator ? "STRATEGY" : source?.name ?? "External queue"}</span>
        <b aria-hidden="true">{isOrchestrator ? "⌁" : "→"}</b>
        <span>{isOrchestrator ? "AGENTS" : agent.name}</span>
      </div>

      <div className="identity-line">
        <div className="identity-beacon" aria-hidden="true"><i /></div>
        <div><h2 id="inspector-title">{agent.name}</h2><p>{displayRole(agent)}</p></div>
      </div>

      {agent.stale && <div className="stale-warning">Signal has not been updated recently.</div>}

      {customOffice && (
        <>
          <section className="custom-office-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="custom-office-bg" src={customOffice.image} alt="" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="custom-office-agent" src={spriteFor(agent)} alt="" />
            <div><span>DIGITAL OFFICE</span><b>{customOffice.label}</b><small>System prompt saved locally</small></div>
          </section>
          {agent.customRuntime && customProvider && (
            <section className="runtime-profile-card">
              <header><span>REQUESTED RUNTIME</span><em>CONFIG ONLY</em></header>
              <div className="runtime-profile-title"><b>{customProvider.label}</b><code>{agent.customRuntime.adapterId}</code></div>
              <dl>
                <div><dt>Model ID</dt><dd>{agent.customRuntime.model}</dd></div>
                <div><dt>Reasoning</dt><dd>{agent.customRuntime.reasoning}</dd></div>
                <div><dt>Endpoint</dt><dd>{agent.customRuntime.endpoint || "adapter default"}</dd></div>
                <div><dt>Credentials</dt><dd>{agent.customRuntime.credentialEnv ? `$${agent.customRuntime.credentialEnv}` : "runtime session"}</dd></div>
              </dl>
              <p>{customProviderAvailable
                ? "Profile saved. The actual model appears only after the local adapter confirms it."
                : "Provider is missing from this catalog: configuration preserved, adapter unavailable."}</p>
            </section>
          )}
          {onDelete && (
            <button
              type="button"
              className={`delete-custom-agent${deleteArmed ? " is-armed" : ""}`}
              onClick={() => deleteArmed ? onDelete() : setDeleteArmed(true)}
            >
              {deleteArmed ? "Click again to delete" : "Delete local profile"}
            </button>
          )}
        </>
      )}

      <section className="task-card">
        <div className="task-card-heading">
          <span>{isOrchestrator ? "CURRENT OBJECTIVE" : "ASSIGNED TASK"}</span>
          <code>{assignment?.taskId ?? agent.taskId ?? "STANDBY"}</code>
        </div>
        <h3>{assignment?.title ?? agent.task ?? "Awaiting assignment"}</h3>
        <p>{assignment?.summary ?? agent.summary ?? "No safe summary received yet."}</p>
      </section>

      {assignment?.inferred && (
        <p className="inference-note">Route inferred from the agent&apos;s current task.</p>
      )}

      <section className="progress-block">
        <div><span>Phase: {agent.phase?.replace(/^(tool:|adapter:|runtime:)/, "") || STATUS_META[agent.status].short}</span><strong>{progress}%</strong></div>
        <div className="progress-track" aria-label={`Progress ${progress}%`}><i style={{ width: `${progress}%` }} /></div>
      </section>

      <dl className="detail-grid">
        <div><dt>{agent.customRuntime ? "Requested model" : "Model"}</dt><dd>{agent.model || "Not specified"}</dd></div>
        <div><dt>{agent.customRuntime ? "Requested reasoning" : "Reasoning"}</dt><dd>{agent.effort || "provider default"}</dd></div>
        <div><dt>Elapsed</dt><dd>{formatDuration(agent.elapsedSeconds)}</dd></div>
        <div><dt>Assigned</dt><dd>{formatMoment(assignment?.assignedAt ?? agent.startedAt)}</dd></div>
      </dl>

      {agent.review && (
        <section className="review-card">
          <div><span>VERIFICATION</span><b>{agent.review.status || "in progress"}</b></div>
          <p>{agent.review.verdict || "The result is still being reviewed."}</p>
          <small>Verifier: {agent.review.reviewer || "unassigned"} · attempt {agent.review.attempts ?? 1}</small>
        </section>
      )}

      <div className="privacy-note"><i aria-hidden="true">◆</i><p>Safe summary only: no prompts, files, or private reasoning.</p></div>
    </aside>
  );
}

export default function Home() {
  const [liveState, setLiveState] = useState<BureauState | null>(null);
  const [connection, setConnection] = useState<"connecting" | "live" | "offline">("connecting");
  const [viewMode, setViewMode] = useState<"live" | "demo">("live");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [customDefinitions, setCustomDefinitions] = useState<CustomAgentDefinition[]>([]);
  const [customDefinitionsLoaded, setCustomDefinitionsLoaded] = useState(false);
  const inspectorRef = useRef<HTMLElement>(null);
  const teamPanelRef = useRef<HTMLElement>(null);
  const teamButtonRef = useRef<HTMLButtonElement>(null);

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
      const current = parseAgentProfileStore(
        window.localStorage.getItem(AGENT_PROFILES_STORAGE_KEY),
        ROSTER_AGENT_IDS,
        RUNTIME_PROVIDERS,
      );
      if (current.valid) {
        setCustomDefinitions(current.profiles);
        setCustomDefinitionsLoaded(true);
        return;
      }

      const legacyValue = window.localStorage.getItem(LEGACY_CUSTOM_AGENTS_STORAGE_KEY);
      const legacyProfiles = migrateLegacyAgentProfiles(
        legacyValue,
        (value) => window.localStorage.setItem(AGENT_PROFILES_STORAGE_KEY, value),
        () => window.localStorage.removeItem(LEGACY_CUSTOM_AGENTS_STORAGE_KEY),
        ROSTER_AGENT_IDS,
      );
      setCustomDefinitions(legacyProfiles);
      setCustomDefinitionsLoaded(true);
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  useEffect(() => {
    if (!customDefinitionsLoaded) return;
    try {
      window.localStorage.setItem(
        AGENT_PROFILES_STORAGE_KEY,
        serializeAgentProfileStore(customDefinitions),
      );
    } catch {
      // A blocked or full localStorage must not break the observer UI.
    }
  }, [customDefinitions, customDefinitionsLoaded]);

  useEffect(() => {
    const syncAcrossTabs = (event: StorageEvent) => {
      if (event.key === AGENT_PROFILES_STORAGE_KEY) {
        const next = parseAgentProfileStore(event.newValue, ROSTER_AGENT_IDS, RUNTIME_PROVIDERS);
        if (next.valid) setCustomDefinitions(next.profiles);
      } else if (
        event.key === LEGACY_CUSTOM_AGENTS_STORAGE_KEY &&
        window.localStorage.getItem(AGENT_PROFILES_STORAGE_KEY) === null
      ) {
        setCustomDefinitions(parseCustomAgents(event.newValue, ROSTER_AGENT_IDS));
      }
    };
    window.addEventListener("storage", syncAcrossTabs);
    return () => window.removeEventListener("storage", syncAcrossTabs);
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

  useEffect(() => {
    if (!teamOpen) return;
    const focusTimer = window.setTimeout(() => {
      teamPanelRef.current?.querySelector<HTMLButtonElement>(".team-agent")?.focus();
    }, 0);
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !teamPanelRef.current?.contains(target) &&
        !teamButtonRef.current?.contains(target)
      ) {
        setTeamOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setTeamOpen(false);
      teamButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [teamOpen]);

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

  const selectAgentFromTeam = (agentId: string) => {
    setTeamOpen(false);
    setSelectedId(agentId);
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
      <h1 className="visually-hidden">Agent Bureau — LIVE OFFICE</h1>
      <p className="visually-hidden">TASK ROUTES · ORCHESTRATOR ASSIGNMENTS · AGENT ROSTER</p>

      <section className="scene-scroll" aria-label="Agent Bureau live office">
        <figure className="office-stage">
          {/* The empty office is the environment layer. Every agent is rendered
              separately below so live roster changes can animate into the scene. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="office-art"
            src="/office-departments-v3.png"
            alt="Pixel-art Agent Bureau interior with eight dedicated role offices"
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
                aria-label={`Open task ${assignment.title}, assigned to ${agent.name}`}
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
              +{stage.overflow.length} in the digital annex
            </button>
          )}
        </figure>
      </section>

      <div className="team-controls">
        {teamOpen && (
          <aside
            id="team-roster-panel"
            ref={teamPanelRef}
            className="team-popover"
            role="dialog"
            aria-label="Team roster"
          >
            <header>
              <span>TEAM ROSTER</span>
              <b>{agents.length} agents</b>
            </header>
            <div className="team-grid">
              {agents.map((agent) => {
                const assignment = latestAssignmentByAgent.get(agent.id);
                const task = assignment?.title ?? agent.task ?? "No task";
                return (
                  <button
                    type="button"
                    key={agent.id}
                    className={`team-agent ${selectedId === agent.id ? "active " : ""}presence-${agent.presence}`}
                    onClick={() => selectAgentFromTeam(agent.id)}
                    aria-label={`${agent.name}, ${displayRole(agent)}, ${STATUS_META[agent.status].label}. ${task}`}
                    title={task}
                  >
                    <span className="team-avatar">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={spriteFor(agent)} alt="" />
                      <i className={`crew-signal status-${agent.status}`} style={{ "--role-accent": roleColor(agent.role) } as CSSProperties} />
                    </span>
                    <span>
                      <strong>{agent.name}</strong>
                      <small>{displayRole(agent)} · {agent.presence === "standby" ? "standby" : STATUS_META[agent.status].short}</small>
                      <em>{task}</em>
                    </span>
                  </button>
                );
              })}
            </div>
            <footer>
              <button
                type="button"
                className="team-mode-switch"
                onClick={toggleMode}
                disabled={!hasLiveAgents}
                title={hasLiveAgents ? "Switch between live and sample data" : "Collector offline — sample data is displayed"}
              >
                <i className={`connection-dot ${connection}`} />
                <span>{usingDemo
                  ? hasLiveAgents ? "Sample data" : "Collector offline · sample data"
                  : `Live connection · ${liveCount} live · ${standbyCount} standby${customCount ? ` · ${customCount} custom` : ""}`}</span>
              </button>
            </footer>
          </aside>
        )}

        <button
          ref={teamButtonRef}
          type="button"
          className={`team-toggle${teamOpen ? " active" : ""}`}
          aria-expanded={teamOpen}
          aria-controls="team-roster-panel"
          aria-haspopup="dialog"
          onClick={() => setTeamOpen((open) => !open)}
        >
          <i>›_</i><span>TEAM</span><b>{agents.length}</b>
        </button>
        <button
          type="button"
          className="add-agent-button"
          aria-label="Add agent"
          title="Add agent"
          onClick={() => {
            setTeamOpen(false);
            setSelectedId(null);
            setBuilderOpen(true);
          }}
        >
          <i>+</i><span>ADD AGENT</span>
        </button>
      </div>

      {selectedAgent && (
        <>
          <button type="button" className="drawer-scrim" onClick={() => setSelectedId(null)} aria-label="Close agent details" />
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
