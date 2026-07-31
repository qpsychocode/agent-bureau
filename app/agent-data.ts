export const OFFICE_KEYS = [
  "orchestrator",
  "researcher",
  "reviewer",
  "coder",
  "designer",
  "copywriter",
  "marketing",
  "image",
] as const;

export type OfficeKey = (typeof OFFICE_KEYS)[number];

export const REASONING_SUGGESTIONS = [
  "provider-default",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const;

export type ReasoningLevel = string;

export type RuntimeProfile = {
  providerId: string;
  adapterId: string;
  model: string;
  reasoning: ReasoningLevel;
  endpoint?: string;
  credentialEnv?: string;
};

export type RuntimeProviderDefinition = {
  id: string;
  label: string;
  badge: string;
  adapterId: string;
  adapterMode: "fixed" | "editable";
  description: string;
  setupHint: string;
  modelPlaceholder: string;
  defaultReasoning: ReasoningLevel;
  endpointMode: "none" | "optional" | "required";
  credentialEnvMode: "none" | "optional" | "required";
  credentialEnv: string;
};

export type CustomAgentDefinition = {
  id: string;
  name: string;
  roleTitle?: string;
  officeKey: OfficeKey;
  avatarKey: OfficeKey;
  runtime: RuntimeProfile;
  systemPrompt: string;
  createdAt: string;
};

export const CUSTOM_AGENT_LIMIT = 40;

export type AgentProfileStore = {
  version: 2;
  profiles: CustomAgentDefinition[];
};

const CUSTOM_AGENT_ID = /^custom-[a-z0-9-]{6,90}$/;
const RUNTIME_ID = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const REASONING_ID = /^[a-z0-9][a-z0-9._-]{0,31}$/;
const ENV_NAME = /^[A-Z_][A-Z0-9_]{0,99}$/;
const OFFICE_KEY_SET = new Set<string>(OFFICE_KEYS);

export const LEGACY_RUNTIME_PROFILE: RuntimeProfile = {
  providerId: "unconfigured",
  adapterId: "unconfigured",
  model: "not-selected",
  reasoning: "provider-default",
};

function normalizeEndpoint(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const url = new URL(value.trim());
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    ) ? url.href.replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

export function normalizeRuntimeProfile(value: unknown): RuntimeProfile | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<RuntimeProfile>;
  const providerId = typeof candidate.providerId === "string" ? candidate.providerId.trim() : "";
  const adapterId = typeof candidate.adapterId === "string" ? candidate.adapterId.trim() : "";
  const model = typeof candidate.model === "string" ? candidate.model.trim() : "";
  const endpoint = normalizeEndpoint(candidate.endpoint);
  const credentialEnv = typeof candidate.credentialEnv === "string"
    ? candidate.credentialEnv.trim()
    : "";
  if (
    !RUNTIME_ID.test(providerId) ||
    !RUNTIME_ID.test(adapterId) ||
    !model ||
    model.length > 160 ||
    /[\u0000-\u001f\u007f]/.test(model) ||
    typeof candidate.reasoning !== "string" ||
    !REASONING_ID.test(candidate.reasoning.trim()) ||
    endpoint === null ||
    (credentialEnv && (
      !ENV_NAME.test(credentialEnv) ||
      /^(NEXT_PUBLIC_|VITE_|PUBLIC_)/.test(credentialEnv)
    ))
  ) {
    return null;
  }
  return {
    providerId,
    adapterId,
    model,
    reasoning: candidate.reasoning.trim(),
    ...(endpoint ? { endpoint } : {}),
    ...(credentialEnv ? { credentialEnv } : {}),
  };
}

export function enforceRuntimeProviderPolicy(
  runtime: RuntimeProfile,
  providers: readonly RuntimeProviderDefinition[],
): RuntimeProfile | null {
  const provider = providers.find((item) => item.id === runtime.providerId);
  if (!provider) return runtime;
  if (
    (provider.adapterMode === "fixed" && runtime.adapterId !== provider.adapterId) ||
    (provider.endpointMode === "none" && runtime.endpoint !== undefined) ||
    (provider.endpointMode === "required" && runtime.endpoint === undefined) ||
    (provider.credentialEnvMode === "none" && runtime.credentialEnv !== undefined) ||
    (provider.credentialEnvMode === "required" && runtime.credentialEnv === undefined)
  ) {
    return null;
  }
  return runtime;
}

export function parseRuntimeProviders(value: unknown): RuntimeProviderDefinition[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const providers: RuntimeProviderDefinition[] = [];
  for (const item of value.slice(0, 30)) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Partial<RuntimeProviderDefinition>;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const adapterId = typeof candidate.adapterId === "string" ? candidate.adapterId.trim() : "";
    const credentialEnv = typeof candidate.credentialEnv === "string"
      ? candidate.credentialEnv.trim()
      : "";
    if (
      !RUNTIME_ID.test(id) ||
      seen.has(id) ||
      !RUNTIME_ID.test(adapterId) ||
      !["fixed", "editable"].includes(candidate.adapterMode ?? "") ||
      typeof candidate.label !== "string" ||
      !candidate.label.trim() ||
      candidate.label.length > 60 ||
      typeof candidate.badge !== "string" ||
      candidate.badge.length > 30 ||
      typeof candidate.description !== "string" ||
      candidate.description.length > 180 ||
      (candidate.setupHint !== undefined && (
        typeof candidate.setupHint !== "string" ||
        !candidate.setupHint.trim() ||
        candidate.setupHint.length > 260
      )) ||
      typeof candidate.modelPlaceholder !== "string" ||
      candidate.modelPlaceholder.length > 180 ||
      typeof candidate.defaultReasoning !== "string" ||
      !REASONING_ID.test(candidate.defaultReasoning.trim()) ||
      !["none", "optional", "required"].includes(candidate.endpointMode ?? "") ||
      !["none", "optional", "required"].includes(candidate.credentialEnvMode ?? "") ||
      (credentialEnv && (
        !ENV_NAME.test(credentialEnv) ||
        /^(NEXT_PUBLIC_|VITE_|PUBLIC_)/.test(credentialEnv)
      ))
    ) {
      continue;
    }
    seen.add(id);
    providers.push({
      id,
      label: candidate.label.trim(),
      badge: candidate.badge.trim(),
      adapterId,
      adapterMode: candidate.adapterMode as "fixed" | "editable",
      description: candidate.description.trim(),
      setupHint: typeof candidate.setupHint === "string"
        ? candidate.setupHint.trim()
        : "Connect this provider through a trusted local runtime adapter.",
      modelPlaceholder: candidate.modelPlaceholder.trim(),
      defaultReasoning: candidate.defaultReasoning.trim(),
      endpointMode: candidate.endpointMode as "none" | "optional" | "required",
      credentialEnvMode: candidate.credentialEnvMode as "none" | "optional" | "required",
      credentialEnv,
    });
  }
  return providers;
}

export function parseCustomAgents(
  value: string | null,
  reservedIds: ReadonlySet<string> = new Set(),
  runtimeProviders?: readonly RuntimeProviderDefinition[],
): CustomAgentDefinition[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];

    const seenIds = new Set(reservedIds);
    const accepted: CustomAgentDefinition[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const candidate = item as Partial<CustomAgentDefinition>;
      const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
      const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
      const roleTitle = typeof candidate.roleTitle === "string" ? candidate.roleTitle.trim() : "";
      const prompt = typeof candidate.systemPrompt === "string"
        ? candidate.systemPrompt.trim()
        : "";
      const normalizedRuntime = candidate.runtime === undefined
        ? LEGACY_RUNTIME_PROFILE
        : normalizeRuntimeProfile(candidate.runtime);
      const runtime = normalizedRuntime && runtimeProviders && candidate.runtime !== undefined
        ? enforceRuntimeProviderPolicy(normalizedRuntime, runtimeProviders)
        : normalizedRuntime;
      if (
        !CUSTOM_AGENT_ID.test(id) ||
        seenIds.has(id) ||
        !name ||
        name.length > 80 ||
        (roleTitle && (roleTitle.length < 2 || roleTitle.length > 80 || /[\u0000-\u001f\u007f]/.test(roleTitle))) ||
        !OFFICE_KEY_SET.has(candidate.officeKey ?? "") ||
        !OFFICE_KEY_SET.has(candidate.avatarKey ?? "") ||
        prompt.length < 12 ||
        prompt.length > 6_000 ||
        !runtime ||
        typeof candidate.createdAt !== "string" ||
        Number.isNaN(Date.parse(candidate.createdAt))
      ) {
        continue;
      }

      seenIds.add(id);
      accepted.push({
        id,
        name,
        ...(roleTitle ? { roleTitle } : {}),
        officeKey: candidate.officeKey as OfficeKey,
        avatarKey: candidate.avatarKey as OfficeKey,
        runtime: { ...runtime },
        systemPrompt: prompt,
        createdAt: candidate.createdAt,
      });
    }

    return accepted.slice(-CUSTOM_AGENT_LIMIT);
  } catch {
    return [];
  }
}

export function parseAgentProfileStore(
  value: string | null,
  reservedIds: ReadonlySet<string> = new Set(),
  runtimeProviders?: readonly RuntimeProviderDefinition[],
) {
  if (!value) return { valid: false, profiles: [] as CustomAgentDefinition[] };
  try {
    const parsed = JSON.parse(value) as Partial<AgentProfileStore>;
    if (!parsed || parsed.version !== 2 || !Array.isArray(parsed.profiles)) {
      return { valid: false, profiles: [] as CustomAgentDefinition[] };
    }
    return {
      valid: true,
      profiles: parseCustomAgents(JSON.stringify(parsed.profiles), reservedIds, runtimeProviders),
    };
  } catch {
    return { valid: false, profiles: [] as CustomAgentDefinition[] };
  }
}

export function serializeAgentProfileStore(profiles: CustomAgentDefinition[]) {
  return JSON.stringify({
    version: 2,
    profiles: profiles.slice(-CUSTOM_AGENT_LIMIT),
  } satisfies AgentProfileStore);
}

export function migrateLegacyAgentProfiles(
  legacyValue: string | null,
  writeV2: (value: string) => void,
  removeLegacy: () => void,
  reservedIds: ReadonlySet<string> = new Set(),
) {
  const profiles = parseCustomAgents(legacyValue, reservedIds);
  if (legacyValue !== null) {
    try {
      writeV2(serializeAgentProfileStore(profiles));
      removeLegacy();
    } catch {
      // The legacy source remains authoritative until the v2 write succeeds.
    }
  }
  return profiles;
}

type AgentIdentity = { id: string; role: string };

export function matchLiveAgentsToRoster<T extends AgentIdentity>(
  roster: readonly T[],
  live: readonly T[],
  normalizeRole: (role: string) => string,
) {
  const byRoster = new Map<number, number>();
  const usedLiveIndexes = new Set<number>();
  const rosterIds = new Set(roster.map((agent) => agent.id));

  // Exact identities are reserved globally before role-based fallback. This keeps
  // a duplicate role from stealing a canonical agent's physical office.
  roster.forEach((base, rosterIndex) => {
    const liveIndex = live.findIndex(
      (candidate, candidateIndex) =>
        !usedLiveIndexes.has(candidateIndex) && candidate.id === base.id,
    );
    if (liveIndex >= 0) {
      byRoster.set(rosterIndex, liveIndex);
      usedLiveIndexes.add(liveIndex);
    }
  });

  roster.forEach((base, rosterIndex) => {
    if (byRoster.has(rosterIndex)) return;
    const liveIndex = live.findIndex(
      (candidate, candidateIndex) =>
        !usedLiveIndexes.has(candidateIndex) &&
        !rosterIds.has(candidate.id) &&
        normalizeRole(candidate.role) === normalizeRole(base.role),
    );
    if (liveIndex >= 0) {
      byRoster.set(rosterIndex, liveIndex);
      usedLiveIndexes.add(liveIndex);
    }
  });

  return {
    byRoster,
    extraIndexes: live
      .map((_, index) => index)
      .filter((index) => !usedLiveIndexes.has(index)),
  };
}

export function reserveUniqueAgentId(preferredId: string, usedIds: Set<string>) {
  const base = preferredId.trim() || "live-agent";
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}--${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}
