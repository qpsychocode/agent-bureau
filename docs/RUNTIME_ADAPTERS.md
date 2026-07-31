# Runtime adapters

Agent Bureau separates two concepts:

1. **Requested runtime** — configuration assembled by the user in the browser.
2. **Actual runtime** — the process and model confirmed by a local adapter.

The public Vercel page supports only the first concept. It does not start a CLI,
call the configured endpoint, or access local secrets.

## Catalog format

Builder cards are read from `config/runtime-providers.json`. A minimal record:

```json
{
  "id": "my-runtime",
  "label": "My runtime",
  "badge": "LOCAL",
  "adapterId": "my-runtime-cli",
  "adapterMode": "fixed",
  "description": "Local CLI adapter",
  "modelPlaceholder": "Exact model ID",
  "defaultReasoning": "provider-default",
  "endpointMode": "optional",
  "credentialEnvMode": "optional",
  "credentialEnv": "MY_RUNTIME_API_KEY"
}
```

`endpointMode` and `credentialEnvMode` accept `none`, `optional`, or `required`.
`adapterMode` accepts `fixed` for a catalog adapter or `editable` for a custom
adapter ID. Model ID and reasoning remain arbitrary safe strings; the adapter
checks whether the installed runtime supports them.

The catalog is declarative data only. Never add executable commands, shell
arguments, or API-key values. `adapterId` points to trusted, preinstalled local
code.

## v2 profile

Profiles are validated against `config/agent-profile.schema.json`. The runtime
portion looks like this:

```json
{
  "providerId": "openai-compatible",
  "adapterId": "openai-compatible",
  "model": "deepseek-r1:14b",
  "reasoning": "provider-default",
  "endpoint": "http://127.0.0.1:11434/v1",
  "credentialEnv": "OLLAMA_API_KEY"
}
```

`credentialEnv` is a variable name, not a secret. The local process reads its
value from the environment. Profiles reject URL credentials, query/hash values,
and names with public web prefixes such as `NEXT_PUBLIC_`, `VITE_`, or `PUBLIC_`.

## Trusted adapter contract

An executable adapter implements three operations:

```ts
type RuntimeAdapter = {
  preflight(profile: RuntimeProfile): Promise<{
    ok: boolean
    actualProvider?: string
    actualModel?: string
    actualReasoning?: string
    message?: string
  }>
  start(profile: RuntimeProfile, task: TaskEnvelope): Promise<RuntimeHandle>
  stop(handle: RuntimeHandle): Promise<void>
}
```

Before `start`, the adapter must:

- locate the local CLI/SDK and check its version;
- confirm that the requested model is available, without silent substitution;
- read a secret only from the process environment using `credentialEnv`;
- validate the endpoint against local security policy; remote plain HTTP must be
  rejected or require explicit confirmation;
- bound execution time, output size, and retry count.

Exact flags for Codex, Cursor, Claude Code, Ollama, or another CLI belong in the
specific adapter implementation because they change more often than the portable
profile.

## Telemetry

After successful preflight/start, the adapter sends normalized
`task.assigned`, `task.started`, `task.completed`, `task.blocked`, or
`task.failed` events to the local collector. Events contain **actual** values:

```json
{
  "type": "task.started",
  "agentId": "custom-researcher",
  "taskId": "SEARCH-42",
  "status": "working",
  "model": "provider-confirmed-model-id",
  "effort": "high",
  "phase": "research",
  "summary": "Verify official sources"
}
```

System prompts, API keys, transcripts, and raw tool output never enter telemetry.
The collector applies an additional allowlist and size limits.

## Adding a runtime

1. Add a declarative card to `config/runtime-providers.json`.
2. Implement a local adapter with the same `adapterId`.
3. Add preflight proof of the actual model with no silent fallback.
4. Test start/stop, timeouts, redaction, and normalized events.
5. Only then mark the runtime as connected in the live interface.

This allows users to bring a Chinese model, local Ollama, cloud API, or custom CLI
without forking the visual interface, while the static site remains unable to
execute arbitrary code.
