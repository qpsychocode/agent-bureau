# Визуальные assets — Agent Bureau Office

## Канонический референс

- `public/og.png` — исходный утверждённый арт и social image.
- Соотношение: `1672 × 941`.
- Не редактировать или заменять без нового явного решения пользователя.

## Dynamic scene v2 — исторический промежуточный слой

Создано 2026-07-31 встроенным ImageGen в ответ на требование отделить агентов от
монолитной картинки и поддержать анимацию/расширение пула.

### Пустой интерьер

- Файл: `public/office-empty-v2.png`; заменён персональной планировкой v3.
- Источник: `public/og.png` как edit target.
- Задача prompt: удалить только пять роботов и их кресла; восстановить фон за
  ними; сохранить пиксельный стиль, перспективу, мебель, свет, палитру,
  композицию, заголовок «АГЕНТСКОЕ БЮРО» и подзаголовок «ЖИВОЙ ОФИС»; не добавлять
  персонажей, текст, watermark и не менять framing.

### Ролевые спрайты

- Финальные файлы: `public/agents/{orchestrator,researcher,coder,reviewer,designer,copywriter,marketing,image}.png`.
- Производный atlas: `public/agents/atlas-v1.png`.
- Источник стиля: `public/og.png`.
- Задача prompt: восемь отдельных full-body pixel-art роботов в регулярном atlas
  `4 × 2`: оркестратор с бирюзовым шарфом и указкой, researcher с лупой, coder с
  ноутбуком, verifier с checklist, designer в фиолетовом берете, copywriter с
  блокнотом, marketer с chart tablet, illustrator с drawing tablet. Единый
  масштаб, 3/4 front view, без текста и watermark, на плоском chroma key фоне.
- Chroma key удалён локальным helper ImageGen; atlas разделён воспроизводимым
  `scripts/crop-agent-atlas.py`.

## Render contract

- Background содержит только окружение.
- Каждый агент рендерится отдельной DOM-кнопкой и использует role sprite.
- Незнакомая роль получает детерминированный fallback sprite по `agentId + role`.
- Цвет роли, статус, координаты и анимация задаются кодом, а не вшиваются в фон.

## Custom departments v3

- Финальный рабочий файл: `public/office-departments-v3.png`.
- Источники: `public/office-empty-v2.png` как edit target и `public/og.png` как
  style/character reference.
- Задача prompt: сохранить заголовок, ночной город, свет, палитру, перспективу и
  pixel scale, но создать ровно восемь пустых кабинетов. Верх: teal Researcher
  archive, увеличенный Orchestrator command room, cyan/coral Verifier QA room.
  Низ: green Coder, purple Designer, amber Copywriter, pink Marketing, orange
  Illustrator. Каждому — собственные границы, стол, мебель и ролевой реквизит;
  без персонажей, лишних комнат, подписей и watermark.
- Runtime mapping: `STAGE_SLOTS` в `app/page.tsx`; дополнительные live-роли
  остаются в цифровом аннексе, а не размещаются поверх чужой мебели.

## Переиспользуемые кабинеты конструктора

- Файлы: `public/offices/{orchestrator,researcher,reviewer,coder,designer,copywriter,marketing,image}.webp`.
- Это восемь воспроизводимых crop-вариантов из утверждённой планировки
  `public/office-departments-v3.png`, а не независимо стилизованные дубликаты.
- Координаты и экспорт описаны в `scripts/crop-office-templates.py`.
- Конструктор накладывает выбранный PNG-аватар отдельным DOM-слоем; поэтому один
  кабинет можно назначать нескольким новым агентам, не генерируя арт заново.
