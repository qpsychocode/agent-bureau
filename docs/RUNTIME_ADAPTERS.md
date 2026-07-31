# Runtime adapters

Agent Bureau разделяет две вещи:

1. **Requested runtime** — конфигурация, которую пользователь собрал в браузере.
2. **Actual runtime** — процесс и модель, подтверждённые локальным адаптером.

Публичная страница на Vercel работает только с первой частью. Она не запускает
CLI, не вызывает указанный endpoint и не имеет доступа к локальным секретам.

## Формат каталога

Карточки конструктора читаются из `config/runtime-providers.json`. Минимальная
запись:

```json
{
  "id": "my-runtime",
  "label": "My runtime",
  "badge": "LOCAL",
  "adapterId": "my-runtime-cli",
  "adapterMode": "fixed",
  "description": "Локальный CLI adapter",
  "modelPlaceholder": "Точный model ID",
  "defaultReasoning": "provider-default",
  "endpointMode": "optional",
  "credentialEnvMode": "optional",
  "credentialEnv": "MY_RUNTIME_API_KEY"
}
```

`endpointMode` и `credentialEnvMode` принимают `none`, `optional` или
`required`. `adapterMode` принимает `fixed` для каталожного адаптера или
`editable` для пользовательского adapter ID. Model ID и reasoning остаются произвольными безопасными строками:
адаптер проверяет, поддерживает ли их конкретный установленный runtime.

Каталог — только декларативные данные. Не добавляйте туда исполняемую команду,
аргументы shell или значение API-ключа. `adapterId` ссылается на заранее
установленный и доверенный локальный код.

## Профиль v2

Профиль проверяется по `config/agent-profile.schema.json`. Его runtime-часть:

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

`credentialEnv` — имя переменной, не секрет. Локальный процесс читает значение
из своего окружения. В профиле запрещены URL credentials, query/hash и имена с
публичными web-префиксами `NEXT_PUBLIC_`, `VITE_`, `PUBLIC_`.

## Контракт доверенного адаптера

Исполняемый адаптер должен реализовать три операции:

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

Перед `start` адаптер обязан:

- найти локальный CLI/SDK и проверить его версию;
- убедиться, что запрошенная модель доступна, без тихой подмены;
- прочитать секрет только по `credentialEnv` из окружения процесса;
- проверить endpoint по локальной политике безопасности; remote plain HTTP
  должен быть отклонён или требовать явного подтверждения;
- ограничить время, объём вывода и число повторных запусков.

Точные флаги Codex, Cursor, Claude Code, Ollama или другого CLI относятся к коду
конкретного адаптера: они меняются чаще, чем переносимый профиль.

## Телеметрия

После успешного preflight/start адаптер отправляет в локальный collector
нормализованные события `task.assigned`, `task.started`, `task.completed`,
`task.blocked` или `task.failed`. В событии указываются **фактические** значения:

```json
{
  "type": "task.started",
  "agentId": "custom-researcher",
  "taskId": "SEARCH-42",
  "status": "working",
  "model": "provider-confirmed-model-id",
  "effort": "high",
  "phase": "research",
  "summary": "Проверяет официальные источники"
}
```

System prompt, API-ключи, transcript и сырой tool output в telemetry не входят.
Collector дополнительно применяет allowlist и ограничения размера.

## Добавление нового runtime

1. Добавьте декларативную карточку в `config/runtime-providers.json`.
2. Реализуйте локальный адаптер с тем же `adapterId`.
3. Добавьте preflight, который доказывает фактическую модель и не делает silent
   fallback.
4. Протестируйте start/stop, таймауты, redaction и нормализованные события.
5. Только после этого отмечайте runtime как подключённый в live-интерфейсе.

Так пользователь может принести китайскую модель, локальный Ollama, облачный API
или собственный CLI без форка визуального интерфейса — и при этом статический
сайт не получает возможность исполнять произвольный код.
