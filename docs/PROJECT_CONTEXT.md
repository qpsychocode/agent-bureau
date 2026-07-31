# Контекст проекта — Agent Bureau Office

## Цель

Показывать работу оркестратора и субагентов как живой пиксельный офис. Пользователь
должен за несколько секунд понять: кто работает, над чем, кто ждёт проверки, кто
заблокирован и какой результат уже принят.

## Текущая версия

- Web UI: `http://localhost:3000`
- Local collector: `http://127.0.0.1:7331`
- Public source: `https://github.com/qpsychocode/agent-bureau`
- Public web: `https://agent-bureau.vercel.app` (Vercel demo)
- Совместный запуск: `start-office.command` или `npm run office`
- Канонический style reference и social image: `public/og.png` (`1672 × 941`)
- Рабочий интерьер без персонажей: `public/office-empty-v2.png`
- Отдельные ролевые спрайты: `public/agents/*.png`
- Компоновка: art-first полноэкранная сцена; HUD и пул агентов плавают поверх,
  карточка выбранного назначения открывается как overlay drawer
- Интерактивность сцены: DOM/CSS overlay с hotspot агентов, визуальной иерархией,
  передачей задач и кликабельным пакетом назначения
- Live merge: постоянный demo roster остаётся каркасом офиса; живые события
  обновляют совпавших агентов по `id` или роли, остальные остаются `standby`
- Динамический пул: 8 постоянных ролей, 4 основных кабинета, до 6 hot desk-мест;
  новый `agentId` появляется отдельным DOM-узлом с entrance/status-анимацией
- Demo assignments: `app/demo-state.json` и `public/demo-state.json`
- История: `.bureau/events.jsonl`
- Снимок: `.bureau/state.json`
- Codex bridge: `.codex/config.toml` → `.codex/hooks/bureau-hook.sh` →
  `scripts/codex-hook.mjs`
- Skill source: `skills/agent-bureau`
- Cursor Researcher adapter: `skills/agent-bureau/scripts/cursor-researcher.mjs`
- Researcher profile: `Cursor Grok 4.5 High Fast`, reasoning `high`, Ask mode
- Cursor Agent CLI: `2026.07.23-e383d2b`, авторизация подтверждена
- Доступный canonical slug: `cursor-grok-4.5-high-fast`
- Фактический smoke-run: `docs/research/runtime-smoke.md`, verdict `approved`

## Контракт события

```json
{
  "type": "task.started",
  "timestamp": "2026-07-31T13:00:00.000Z",
  "runId": "run-42",
  "agentId": "coder-1",
  "name": "Кодер",
  "role": "coder",
  "taskId": "TASK-17",
  "task": "Добавляет авторизацию",
  "status": "working",
  "model": "luna",
  "effort": "medium",
  "phase": "implementation",
  "summary": "Собирает middleware и тесты",
  "progress": 54
}
```

## Контракт назначения задачи

В demo snapshot назначения хранятся отдельно от агентов, чтобы интерфейс мог
показать не только текущую активность, но и направление передачи задачи:

```json
{
  "id": "assignment-ui-14",
  "taskId": "UI-14",
  "fromAgentId": "orchestrator",
  "toAgentId": "designer-1",
  "title": "Собрать каноническую pixel-office сцену",
  "summary": "Использовать точный public/og.png и добавить интерактивный overlay.",
  "status": "working",
  "assignedAt": "2026-07-31T11:54:00.000Z",
  "updatedAt": "2026-07-31T12:00:00.000Z"
}
```

`taskId` целевого агента совпадает с `taskId` назначения. Collector сохраняет не
более 50 последних записей, обновляет их по `assignmentId` или паре
`taskId + agentId` и удаляет prompt/transcript до записи на диск.

## Следующие логичные шаги

1. Подключить собственные события `bureauctl` с явными assignment events, точными
   ролями, task graph и verdict верификатора.
2. Добавить heartbeat от долгоживущих агентов.
3. Упаковать проверенный web UI в Tauri с автозапуском и иконкой меню.
4. При реальной необходимости добавить авторизованное outbound-only облачное
   read-only зеркало вместо demo feed на публичном сайте.

## Известные ограничения

- Project hooks требуют доверия через `/hooks` и применяются к задачам этого
  репозитория.
- Tool hooks не содержат `agent_id`; они отображаются как активность
  оркестратора.
- Live UI требует работающего локального процесса.
- Интерьер имеет фиксированную композицию: координаты основных кабинетов, hot desk
  и маршрутов привязаны к соотношению `1672 × 941`. На узком экране сцена
  уменьшается целиком, а переполнение остаётся доступно в нижнем пуле.
- Публичный Vercel deployment не может читать `127.0.0.1` пользователя и всегда
  откатывается на безопасный demo snapshot.
- Состояние `stale` появляется после 45 секунд без нового события или heartbeat.
- Обычный Codex spawn не может сам выдать внешний профиль Cursor/Grok. Researcher
  запускается отдельным CLI adapter, а модель считается подтверждённой только после
  проверки стартового `stream-json` события.
