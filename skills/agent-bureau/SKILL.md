---
name: agent-bureau
description: Orchestrate complex project work through a pool of specialist agents, independent review, bounded revision cycles, and Markdown decision memory. Use for multi-step development, design, writing, marketing, image generation, and research when parallel specialists, explicit acceptance criteria, and preserved context across tasks are valuable.
---

# Agent Bureau

## Purpose

Operate as an accountable bureau rather than an uncontrolled crowd of agents. Make the
orchestrator own the final result, call the smallest sufficient team, integrate the results,
assign an independent review, and preserve only useful decision context.

Do not create permanent processes "just in case." Treat the pool as a role registry;
start specific agents when needed and end them after they deliver their artifact.

## Required start

1. Read the local project instructions and available context files.
2. State the objective, constraints, expected artifact, and verifiable acceptance criteria.
3. Decide whether delegation is necessary. Complete a simple sequential task directly.
4. For a complex task, build a small graph of independent subtasks and select the roles.
5. Before launch, give every agent its model profile, inputs, boundaries, deliverable, and
   completion criteria.
6. If the current project exposes `scripts/bureauctl.mjs`, publish the safe lifecycle
   events described below. Telemetry is best-effort and must never delay or change the work.

If the task changes the project, read
[references/project-memory.md](references/project-memory.md). If the task requires search
or current external information, read
[references/researcher.md](references/researcher.md). Before selecting models, read
[references/model-routing.md](references/model-routing.md).

When assigning the Researcher, use the bundled adapter
`scripts/cursor-researcher.mjs`; an ordinary Codex subagent does not satisfy the pinned
Cursor/Grok profile.

## Role pool

| Role | When to use | Primary deliverable |
|---|---|---|
| Orchestrator | Always for a complex task | Plan, assignments, integration, final decision |
| Coder | Code, automation, tests, infrastructure | Working change and verification |
| Designer | UX/UI, visual system, mockups | Verifiable visual solution |
| Copywriter | Copy, message structure, editing | Final copy for the audience and channel |
| Illustrator | A new bitmap visual is needed | Image and usage parameters |
| Marketer | Positioning, channels, offer, hypotheses | Plan with assumptions and metrics |
| Researcher | Current facts, sources, or comparisons are needed | Report with citations, uncertainty, and conclusion |
| Verifier | A meaningful artifact requires acceptance | Verdict against the stated criteria |

Add a new role only when no existing role covers a recurring type of work.

## Activity telemetry

When `scripts/bureauctl.mjs` is present, make the bureau observable from the start instead
of reconstructing activity after completion:

1. Emit `task.started` for the orchestrator with a concise task title and current phase.
2. Emit `task.assigned` when work is delegated, including `from-agent-id`, `to-agent-id`,
   task ID, safe title, and acceptance-oriented summary.
3. Emit `agent.started` or `task.started` when the worker begins. Publish phase and progress
   updates only at meaningful transitions; do not create noisy heartbeats.
4. Emit `artifact.submitted`, then `review.started`, and finish with `review.approved`,
   `review.revision_requested`, `task.blocked`, or `task.completed` as appropriate.
5. If publication fails, continue the actual task and mention the telemetry gap in the
   delivery only when it affects the requested observer experience.

Example:

```bash
node scripts/bureauctl.mjs emit \
  --type task.assigned \
  --task-id TASK-001 \
  --from-agent-id orchestrator \
  --to-agent-id coder \
  --title "Implement the accepted interface" \
  --summary "Build and test the approved scope"
```

Telemetry is a public-facing operational summary, not a transcript. Never publish prompts,
responses, hidden reasoning, tool arguments, file contents or paths, diffs, credentials,
personal data, or secrets. Prefer a generic safe title when the underlying task is private.

## Assignment package

Give each agent one self-contained package:

```yaml
task_id: TASK-001
role: researcher
objective: What must be produced
why_now: Why the overall result needs it
inputs: Files, facts, and dependencies
constraints: What must not be changed or assumed
deliverable: Result format and location
acceptance: Verifiable criteria
model_profile: Requested provider/model/mode/effort
budget: Limit on time, iterations, or requests
telemetry: Safe task title and phase names to publish, when supported
```

Do not give an agent the entire project context without need. Provide only relevant
decisions, known failures, and dependencies.

## Parallel work

- Parallelize only independent subtasks.
- Do not allow two agents to edit the same area without explicitly separating ownership.
- Start the next wave after its dependencies are ready.
- Keep the orchestrator doing useful local work while agents execute their assignments.
- Do not let an agent create its own workers or reviewers unless the assignment package
  explicitly permits it.

## Agent delivery format

Require the agent to return:

1. `status`: `complete`, `partial`, or `blocked`.
2. `deliverable`: the artifact or an exact link to it.
3. `actions`: a brief account of what was done.
4. `decisions`: decisions made and why they are appropriate.
5. `evidence`: tests, sources, or observable checks.
6. `risks`: uncertainty, tradeoffs, and open questions.

Require an explainable decision summary, not the model's hidden step-by-step reasoning.

## Verification and loop prevention

Give the verifier the original task, acceptance criteria, and artifact, but do not instruct
it to "find an error at all costs." Require one of three verdicts:

- `approved` — all blocking criteria are met;
- `revision_required` — specific, actionable violations remain;
- `escalate` — the criteria conflict, evidence is insufficient, or a user decision is needed.

For every issue, require an `issue_id`, the violated criterion, evidence, and a closure
condition. Do not treat a matter of taste as blocking unless the criteria include it.

Enforce these hard loop limits:

- Allow no more than two revision rounds after the initial delivery.
- Do not let the verifier repeat an earlier issue without new evidence.
- After the second unsuccessful round, require the orchestrator to stop the loop.
- Then choose exactly one action: accept with a recorded risk, narrow the task, change the
  worker/model, or request a user decision.
- Do not let the verifier review its own result or launch another verifier.

## Result integration

Require the orchestrator to independently check important claims, artifact compatibility,
and final criteria. Then have it:

1. integrate only compatible results;
2. record rejected alternatives and why they were rejected;
3. perform a final check proportional to risk;
4. update project memory;
5. tell the user the outcome, known limitations, and the models actually used.

Never present the requested model profile as the one actually used. Always store
`requested_*` and `actual_*` separately.
