# Model routing

## Core rule

Choose a model by risk and type of work, not by role name. Store both sets of fields for
every run:

```yaml
requested_provider: cursor
requested_model: cursor-grok-4.5-high-fast
requested_effort: high
requested_mode: fast
actual_provider: cursor
actual_model: Cursor Grok 4.5 Fast
actual_effort: high
actual_mode: fast
attestation: canonical slug from model list + normalized init model
```

If the runtime does not report the actual model, mark it as `unverified`. If the user pinned
a specific model, an `unverified` result or substitution is blocking.

## Bureau profiles

| Profile | Preference | Reasoning | Use |
|---|---|---|---|
| `orchestrator-primary` | The strongest available orchestration model; currently prefer GPT-5.6 Sol | high or above | Decomposition, conflicting requirements, integration |
| `coder-primary` | Luna; resolve and attest its exact canonical ID in the active runtime | medium by default, high for complex or risky changes | All implementation code, tests, refactors, and debugging |
| `worker-economy` | Luna, when available in the active runtime | medium by default, high for complex work | Routine writing, marketing, and preparation |
| `research-primary` | Cursor Grok 4.5 High Fast | high + fast | External search and evidence-based reports |
| `verifier-primary` | A strong independent model, not the worker's session | high | Review of meaningful artifacts |
| `image-primary` | Specialized image generation tool | tool-specific | New raster images |

Treat the user-specified Luna profile as pinned for the Coder and preferred for economy
workers. Before a Coder writes or changes code, verify Luna in the specific product and
account, select the runtime's exact canonical model identifier, and attest the launched
model. Do not claim Luna was used unless the runtime reported it. An unavailable,
unverified, or substituted Luna is blocking for a Coder assignment; ask the user before
routing implementation to Sol, Terra, or any other model. For non-coding work where no
model is pinned, the orchestrator may choose an available economy substitute with effort
no lower than medium and explicitly record the substitution.

## Reasoning level

- `medium` — the Bureau minimum for ordinary worker tasks.
- `high` — research, verification, complex changes, and ambiguous decisions.
- Use a higher level only when risk justifies the cost and latency.
- Do not use `low` by default.

## Availability check

1. Obtain the model list directly from the active runtime.
2. Match the requested profile by actual capabilities, not only a similar name.
3. After launch, normalize `system/init.model` and compare it with the selected entry's
   display name or canonical slug.
4. On mismatch, stop a required profile or explicitly agree on a substitution.
5. Do not encode temporary promotions or prices as a permanent routing rule.

The current Codex subagent interface may offer a different model set than Cursor. The
orchestrator cannot treat Cursor/Grok as launched through an ordinary Codex spawn; that
requires a separate Cursor CLI/SDK adapter.
