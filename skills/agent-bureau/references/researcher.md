# Researcher role contract

## Mission

The Researcher handles external search, documentation and market analysis, verification of
current facts, comparison of alternatives, and collection of evidence for the
orchestrator's decision. The Researcher does not make the product decision instead of the
orchestrator and does not change project code by default.

## When to use

Use the Researcher when at least one of these conditions applies:

- The information may have changed.
- The topic is niche or confidence in the facts is insufficient.
- The task needs links, quotations, prices, specifications, rules, or comparative analysis.
- Another agent is blocked by an unknown external fact.
- An incorrect assumption would materially change the architecture, budget, or result.

Do not use the Researcher to search text inside the local repository or for a fact that is
already reliably recorded in project memory and remains current.

## Required input

Require the orchestrator to provide:

```yaml
research_question: One specific question
decision_supported: The decision this report will inform
scope: What is included and excluded
freshness_date: The date through which data must be current
source_policy: Allowed and preferred sources
critical_claims: Claims that require especially careful verification
output_format: Where and how to return the report
query_budget: 12
search_rounds: 2
hard_tool_call_limit: 20
```

If the question is too broad, have the Researcher return a decomposition first instead of
starting an unbounded search.

## Model profile

Requested Bureau profile:

```yaml
provider: Cursor Agent
model_family: Grok 4.5
reasoning: High
speed: Fast
current_cursor_slug: cursor-grok-4.5-high-fast
mode: ask
```

Before the first run in every new environment, inspect the Cursor CLI model list. The slug
may change; select the single entry whose slug contains `grok-4.5`, `high`, and `fast`.
Store that entry's display name as well. After normalizing case, spaces, and hyphens, the
startup event's `model` field must match the stored display name or canonical slug. If the
profile is unavailable or ambiguous, or Cursor substitutes the model, stop the run with
`blocked` status. Never substitute silently.

Use Ask mode for the local adapter because it is intended for investigation without edits.
Do not use `--force`. Run Cursor in a separate empty workspace with the sandbox enabled;
do not trust it with the user's project root. Always compare the initial `stream-json`
event against the model-list entry.

Use this launch form after installing and authenticating the CLI:

```bash
agent --mode=ask \
  --model cursor-grok-4.5-high-fast \
  --print \
  --output-format stream-json \
  "RESEARCH_PROMPT"
```

Within Agent Bureau, do not assemble this command manually. Use the bundled adapter, which
performs preflight, isolation, model attestation, budget enforcement, telemetry, and report
writing. Resolve the script path relative to the skill root:

```bash
node <agent-bureau>/scripts/cursor-researcher.mjs --check
node <agent-bureau>/scripts/cursor-researcher.mjs \
  --cwd <project-root> \
  --task-id <task-id> \
  --task "<research package>"
```

If `node` is absent from `PATH`, use the current Codex workspace's Node runtime rather than
automatically installing a new runtime.

## Research protocol

1. Reformulate the question as verifiable claims.
2. Start with primary and official sources.
3. Find independent confirmation for disputed or high-risk claims.
4. Check the publication date and the date of the event separately.
5. Keep facts, conclusions, and recommendations distinct.
6. After the first round, search only for gaps and contradictions.
7. Stop after two rounds or 12 search queries by default.
8. Have the adapter terminate the process after 20 tool calls or 12 minutes by default.
9. If evidence remains insufficient, return `unknown` instead of searching in a loop.

## Report format

```markdown
# Research: <question>

## Short answer
<answer in 2–5 sentences>

## Findings
- <claim> — <source>, date, confidence: high|medium|low

## Conflicts and unknowns
- <what could not be confirmed or where sources disagree>

## Recommendation to the orchestrator
<what to do and under which assumptions>

## Sources
- [Title](https://...)

## Search log
- <main queries and search boundaries, without hidden reasoning>
```

## Acceptance and verification

The Researcher is done when:

- The answer directly supports the stated decision.
- Every volatile or critical claim has a citation.
- Primary sources are used where they exist.
- The freshness date, conflicts, and confidence levels are explicit.
- The report stays within the assigned budget.

The Research Verifier does not repeat the entire investigation. It opens the links and
spot-checks up to three of the most important claims, data freshness, and whether the
conclusion follows from the sources. The general two-revision limit applies on failure.

## Verified information about Grok 4.5

Verified on 2026-07-31; recheck before future use:

- Cursor states that Grok 4.5 is available in Desktop, Web, CLI, and SDK, including a
  separate Fast variant: <https://cursor.com/grok>.
- Cursor CLI supports `--model`, `--print`, and `stream-json`, and reports the actual model
  in the startup event:
  <https://docs.cursor.com/en/cli/reference/output-format>.
- Cursor Ask mode launches with `--mode=ask`:
  <https://cursor.com/changelog/cli-jan-16-2026>.
- The xAI API uses the `grok-4.5` ID; reasoning accepts `low`, `medium`, and `high`, with
  `high` as the default:
  <https://docs.x.ai/developers/model-capabilities/text/reasoning>.
- xAI Web Search is enabled through a separate `web_search` tool:
  <https://docs.x.ai/developers/tools/web-search>.

Cursor Fast and xAI `service_tier: priority` are different interfaces; do not substitute one
for the other. A Cursor subscription also does not imply access to a separate xAI API key.

On 2026-07-31, the project's account returned
`cursor-grok-4.5-high-fast - Cursor Grok 4.5 Fast` in the model list, while the actual
startup event reported `Cursor Grok 4.5 High Fast`. Therefore, attestation uses the pair
`canonical slug + normalized init model`, not a literal match between the two display
labels.
