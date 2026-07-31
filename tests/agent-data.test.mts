import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOM_AGENT_LIMIT,
  matchLiveAgentsToRoster,
  migrateLegacyAgentProfiles,
  normalizeRuntimeProfile,
  parseAgentProfileStore,
  parseCustomAgents,
  parseRuntimeProviders,
  reserveUniqueAgentId,
  serializeAgentProfileStore,
} from "../app/agent-data.ts";

const createdAt = "2026-07-31T16:00:00.000Z";

function customRecord(index: number) {
  return {
    id: `custom-test-${index.toString(36).padStart(2, "0")}`,
    name: `Agent ${index}`,
    roleTitle: "Growth researcher",
    officeKey: "coder",
    avatarKey: "designer",
    runtime: {
      providerId: "openai-compatible",
      adapterId: "openai-compatible",
      model: `community-model-${index}`,
      reasoning: "thinking-16384",
      endpoint: "http://127.0.0.1:11434/v1",
      credentialEnv: "LOCAL_MODEL_API_KEY",
    },
    systemPrompt: "A sufficiently specific system prompt.",
    createdAt,
  };
}

test("custom profile parser rejects malformed, reserved, and duplicate identities", () => {
  assert.deepEqual(parseCustomAgents("not-json"), []);
  assert.deepEqual(parseCustomAgents("{}"), []);

  const valid = customRecord(1);
  const parsed = parseCustomAgents(JSON.stringify([
    { ...valid, id: "" },
    { ...valid, id: "orchestrator" },
    { ...valid, id: "custom-reserved" },
    valid,
    { ...valid, name: "Duplicate" },
    { ...customRecord(2), name: "   " },
    { ...customRecord(3), systemPrompt: "too short" },
  ]), new Set(["custom-reserved", "orchestrator"]));

  assert.deepEqual(parsed, [valid]);
});

test("legacy profiles migrate to an explicit unconfigured runtime", () => {
  const legacy = customRecord(9);
  const legacyWithoutRuntime: Partial<ReturnType<typeof customRecord>> = { ...legacy };
  delete legacyWithoutRuntime.runtime;
  const [migrated] = parseCustomAgents(JSON.stringify([legacyWithoutRuntime]));
  assert.equal(migrated.runtime.providerId, "unconfigured");
  assert.equal(migrated.runtime.adapterId, "unconfigured");
  assert.equal(migrated.runtime.model, "not-selected");
  assert.equal(migrated.systemPrompt, legacy.systemPrompt);
});

test("profiles created before custom specialties remain readable", () => {
  const legacyNamedProfile = { ...customRecord(10), roleTitle: undefined };
  const [parsed] = parseCustomAgents(JSON.stringify([legacyNamedProfile]));
  assert.equal(parsed.name, legacyNamedProfile.name);
  assert.equal(parsed.roleTitle, undefined);
});

test("runtime profiles keep arbitrary safe model settings without accepting secrets or unsafe URLs", () => {
  assert.deepEqual(normalizeRuntimeProfile({
    providerId: "community-runtime",
    adapterId: "trusted-local-adapter",
    model: "qwen-or-any-future-model",
    reasoning: "thinking-16384",
    endpoint: "http://127.0.0.1:11434/v1/",
    credentialEnv: "COMMUNITY_API_KEY",
    apiKey: "must-be-ignored",
  }), {
    providerId: "community-runtime",
    adapterId: "trusted-local-adapter",
    model: "qwen-or-any-future-model",
    reasoning: "thinking-16384",
    endpoint: "http://127.0.0.1:11434/v1",
    credentialEnv: "COMMUNITY_API_KEY",
  });
  assert.equal(normalizeRuntimeProfile({
    providerId: "custom",
    adapterId: "custom-adapter",
    model: "model",
    reasoning: "high",
    endpoint: "https://user:secret@example.com/v1",
  }), null);
  assert.equal(normalizeRuntimeProfile({
    providerId: "custom",
    adapterId: "custom-adapter",
    model: "model",
    reasoning: "high",
    credentialEnv: "NEXT_PUBLIC_SECRET",
  }), null);
  assert.equal(normalizeRuntimeProfile({
    providerId: "custom",
    adapterId: "custom-adapter",
    model: "model\n--unsafe-arg",
    reasoning: "high",
  }), null);
});

test("versioned profile store is authoritative and bounded", () => {
  const profiles = Array.from({ length: CUSTOM_AGENT_LIMIT + 2 }, (_, index) => customRecord(index));
  const encoded = serializeAgentProfileStore(profiles);
  const decoded = parseAgentProfileStore(encoded);
  assert.equal(decoded.valid, true);
  assert.equal(decoded.profiles.length, CUSTOM_AGENT_LIMIT);
  assert.equal(decoded.profiles[0].id, profiles[2].id);
  assert.equal(parseAgentProfileStore(JSON.stringify({ version: 1, profiles })).valid, false);
});

test("runtime catalog is data-driven and drops duplicate or malformed connectors", () => {
  const provider = {
    id: "community",
    label: "Community runtime",
    badge: "OPEN",
    adapterId: "community-adapter",
    adapterMode: "fixed",
    description: "A user-supplied trusted runtime adapter",
    setupHint: "Start the trusted community adapter locally.",
    modelPlaceholder: "Any model id",
    defaultReasoning: "provider-default",
    endpointMode: "optional",
    credentialEnvMode: "optional",
    credentialEnv: "COMMUNITY_API_KEY",
  };
  assert.deepEqual(parseRuntimeProviders([
    provider,
    { ...provider, label: "Duplicate" },
    { ...provider, id: "bad id" },
  ]), [provider]);
  assert.equal(parseRuntimeProviders([{ ...provider, id: "required-env", credentialEnvMode: "required" }]).length, 1);
  const legacyCatalog = { ...provider, setupHint: undefined };
  assert.equal(
    parseRuntimeProviders([legacyCatalog])[0].setupHint,
    "Connect this provider through a trusted local runtime adapter.",
  );
});

test("known provider policies cannot be bypassed through localStorage", () => {
  const providers = parseRuntimeProviders([{
    id: "cursor",
    label: "Cursor",
    badge: "CURSOR",
    adapterId: "cursor-agent-cli",
    adapterMode: "fixed",
    description: "Cursor CLI",
    setupHint: "Authenticate Cursor CLI and select a model.",
    modelPlaceholder: "Model slug",
    defaultReasoning: "high",
    endpointMode: "none",
    credentialEnvMode: "none",
    credentialEnv: "",
  }]);
  const valid = customRecord(21);
  const tampered = {
    ...valid,
    runtime: {
      ...valid.runtime,
      providerId: "cursor",
      adapterId: "shell-from-storage",
      endpoint: "https://example.com/v1",
      credentialEnv: "STOLEN_KEY",
    },
  };
  const store = serializeAgentProfileStore([tampered]);
  assert.deepEqual(parseAgentProfileStore(store, new Set(), providers).profiles, []);
});

test("legacy migration keeps v1 when the v2 write fails", () => {
  const legacy = customRecord(22);
  const legacyWithoutRuntime: Partial<ReturnType<typeof customRecord>> = { ...legacy };
  delete legacyWithoutRuntime.runtime;
  let removed = false;
  const profiles = migrateLegacyAgentProfiles(
    JSON.stringify([legacyWithoutRuntime]),
    () => { throw new Error("quota exceeded"); },
    () => { removed = true; },
  );
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].runtime.providerId, "unconfigured");
  assert.equal(removed, false);
});

test("custom profile parser keeps only the newest forty valid profiles", () => {
  const input = Array.from({ length: CUSTOM_AGENT_LIMIT + 5 }, (_, index) => customRecord(index));
  const parsed = parseCustomAgents(JSON.stringify(input));
  assert.equal(parsed.length, CUSTOM_AGENT_LIMIT);
  assert.equal(parsed[0].id, input[5].id);
  assert.equal(parsed.at(-1)?.id, input.at(-1)?.id);
  assert.equal(new Set(parsed.map((item) => item.id)).size, CUSTOM_AGENT_LIMIT);
});

test("exact live identities win before role fallback and extras get unique render ids", () => {
  const roster = [
    { id: "coder-1", role: "coder" },
    { id: "reviewer-1", role: "reviewer" },
  ];
  const live = [
    { id: "early-coder", role: "coder" },
    { id: "coder-1", role: "coder" },
    { id: "live-reviewer", role: "reviewer" },
    { id: "coder-1", role: "designer" },
  ];
  const matched = matchLiveAgentsToRoster(roster, live, (role) => role);

  assert.equal(matched.byRoster.get(0), 1);
  assert.equal(matched.byRoster.get(1), 2);
  assert.deepEqual(matched.extraIndexes, [0, 3]);

  const used = new Set(roster.map((agent) => agent.id));
  const extraIds = matched.extraIndexes.map((index) => reserveUniqueAgentId(live[index].id, used));
  assert.deepEqual(extraIds, ["early-coder", "coder-1--2"]);
  assert.equal(new Set([...used]).size, 4);
});
