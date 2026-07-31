import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOM_AGENT_LIMIT,
  matchLiveAgentsToRoster,
  parseCustomAgents,
  reserveUniqueAgentId,
} from "../app/agent-data.ts";

const createdAt = "2026-07-31T16:00:00.000Z";

function customRecord(index: number) {
  return {
    id: `custom-test-${index.toString(36).padStart(2, "0")}`,
    name: `Agent ${index}`,
    officeKey: "coder",
    avatarKey: "designer",
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
