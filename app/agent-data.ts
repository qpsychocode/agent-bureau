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

export type CustomAgentDefinition = {
  id: string;
  name: string;
  officeKey: OfficeKey;
  avatarKey: OfficeKey;
  systemPrompt: string;
  createdAt: string;
};

export const CUSTOM_AGENT_LIMIT = 40;

const CUSTOM_AGENT_ID = /^custom-[a-z0-9-]{6,90}$/;
const OFFICE_KEY_SET = new Set<string>(OFFICE_KEYS);

export function parseCustomAgents(
  value: string | null,
  reservedIds: ReadonlySet<string> = new Set(),
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
      const prompt = typeof candidate.systemPrompt === "string"
        ? candidate.systemPrompt.trim()
        : "";
      if (
        !CUSTOM_AGENT_ID.test(id) ||
        seenIds.has(id) ||
        !name ||
        name.length > 80 ||
        !OFFICE_KEY_SET.has(candidate.officeKey ?? "") ||
        !OFFICE_KEY_SET.has(candidate.avatarKey ?? "") ||
        prompt.length < 12 ||
        prompt.length > 6_000 ||
        typeof candidate.createdAt !== "string" ||
        Number.isNaN(Date.parse(candidate.createdAt))
      ) {
        continue;
      }

      seenIds.add(id);
      accepted.push({
        id,
        name,
        officeKey: candidate.officeKey as OfficeKey,
        avatarKey: candidate.avatarKey as OfficeKey,
        systemPrompt: prompt,
        createdAt: candidate.createdAt,
      });
    }

    return accepted.slice(-CUSTOM_AGENT_LIMIT);
  } catch {
    return [];
  }
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
