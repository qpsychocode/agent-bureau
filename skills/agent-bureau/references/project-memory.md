# Project memory and future RAG

## Source of truth

Keep Markdown as the canonical, human-readable source. Treat RAG as an index over these
files: it helps retrieve relevant passages but does not replace the documents or hold the
only copy of a decision.

Use this minimum project structure:

```text
docs/
  PROJECT_CONTEXT.md   concise, current project state
  DECISIONS.md         accepted architecture and product decisions
  LESSONS.md           failures, rejected approaches, and retry conditions
  tasks/
    TASK-001.md        log for a meaningful task
  research/
    TOPIC.md           evidence-based research reports
```

Do not create a log for every minor command. Record what will help the next agent make a
decision or avoid repeating a mistake.

## What to read before a task

1. Read `PROJECT_CONTEXT.md` for all meaningful project work.
2. Read relevant ADRs from `DECISIONS.md`.
3. Read relevant entries in `LESSONS.md` for the affected area.
4. Read only related task/research documents found by headings and metadata.

Do not load the entire history without filtering; it dilutes current context.

## Recording a decision

```markdown
## ADR-NNN — Title

- Status: proposed | accepted | superseded
- Date: YYYY-MM-DD
- Area: <components or tags>
- Context: <the problem that required a decision>
- Decision: <what was selected>
- Why: <concise, verifiable rationale>
- Alternatives: <what was rejected and why>
- Consequences: <costs and limitations>
- Evidence: <tests, metrics, links>
- Revisit when: <signal that the decision is stale>
```

Record an explainable rationale, not the model's internal chain of thought.

## Recording a failure

```markdown
## LESSON-NNN — Short title

- Date: YYYY-MM-DD
- Attempt: <what was done>
- Observation: <how the failure appeared>
- Cause: <confirmed cause or unknown>
- Do not repeat: <specific anti-pattern>
- Retry if: <conditions that must change>
- Evidence: <log, test, link>
```

This rule prevents an incorrect permanent ban: a failed approach may become appropriate
after conditions change.

## Preparing for RAG

When the document set becomes large enough:

1. Split documents into meaningful sections while preserving headings.
2. Index text and metadata: `project`, `type`, `status`, `area`, `date`,
   `supersedes`, `tags`.
3. Before a task, retrieve accepted decisions and active lessons for the area first.
4. Return passages to the agent with a link to the source Markdown file.
5. Exclude superseded decisions from answers by default, but preserve them for audit.
6. Reindex changed sections after updating Markdown.

Start with ordinary full-text search. Add a vector index when manual search no longer
reliably finds paraphrased decisions.
