# Задача: AUD-014 — типизированный Mediator

## Цель

Устранить потерю типобезопасности в `BaseMediator`.

В проекте уже существует `AppEventMap`, описывающий payload каждого события, но текущий `BaseMediator` работает через `Map<string, any>`. В результате TypeScript не контролирует соответствие события и его payload на границе Mediator.

Задача должна исправить именно типизацию существующей архитектуры, не меняя сам паттерн Mediator.

---

## 1. Основная идея

Сделать `BaseMediator` generic-классом:

```ts
class BaseMediator<TEventMap extends Record<string, unknown>>
```

Конкретный `AppMediator` должен использовать существующий `AppEventMap`:

```ts
class AppMediator extends BaseMediator<AppEventMap>
```

Таким образом тип события определяет тип его payload.

---

## 2. Типизированный `on`

Публичный API подписки должен использовать ключ события и соответствующий ему payload:

```ts
on<K extends keyof TEventMap>(
  event: K,
  handler: (payload: TEventMap[K]) => void,
): () => void
```

TypeScript должен проверять тип обработчика относительно конкретного события.

---

## 3. Типизированный `emit`

Публикация события также должна зависеть от `AppEventMap`.

Для событий без payload необходимо сохранить возможность вызова без второго аргумента. Предпочтительный вариант — условная tuple-типизация:

```ts
emit<K extends keyof TEventMap>(
  event: K,
  ...args: TEventMap[K] extends void
    ? []
    : [payload: TEventMap[K]],
): void
```

Ожидаемое поведение:

```ts
mediator.emit("RELOAD_TABLES");            // OK
mediator.emit("POINTS_MODEL_READY", data); // OK

mediator.emit("RELOAD_TABLES", data);      // compile error
mediator.emit("POINTS_MODEL_READY");       // compile error
```

Конкретный способ представления payloadless-событий должен соответствовать фактическому `AppEventMap`.

---

## 4. Внутренняя реализация

Внутри `BaseMediator` допустим технический type cast, необходимый для хранения обработчиков в общей структуре.

Важно:

- `any` не должен попадать в публичный API;
- типовая небезопасность должна быть изолирована внутри реализации Mediator;
- пользователи Mediator должны работать только с типизированными `on` / `emit`;
- не следует ради устранения одного внутреннего cast усложнять архитектуру.

---

## 5. Что не нужно менять

Не нужно:

- заменять Mediator на Redux/Zustand/EventEmitter;
- создавать отдельный класс для каждого события;
- переносить события в другой механизм;
- менять runtime-семантику подписки/публикации;
- добавлять новые уровни абстракции без необходимости;
- расширять Mediator функциональностью, не связанной с AUD-014.

Цель — сохранить существующую архитектуру и восстановить типобезопасность.

---

## 6. План реализации

1. Найти текущие `BaseMediator`, `AppMediator` и `AppEventMap`.
2. Проверить все существующие вызовы `on` и `emit`.
3. Сделать `BaseMediator` generic по карте событий.
4. Типизировать `on` через `keyof TEventMap` и `TEventMap[K]`.
5. Типизировать `emit` через `keyof TEventMap` и `TEventMap[K]`.
6. Отдельно обработать события без payload.
7. Убрать `any` из публичного API Mediator.
8. Оставить внутренние casts только там, где они действительно необходимы для общей структуры обработчиков.
9. Сделать `AppMediator` конкретным `BaseMediator<AppEventMap>`.
10. Запустить TypeScript build проекта.
11. Исправить реальные несовпадения типов в существующих потребителях.
12. Проверить, что runtime-поведение Mediator не изменилось.

---

## 7. Критерии готовности

- [ ] `BaseMediator` параметризован картой событий.
- [ ] `AppMediator` использует `AppEventMap`.
- [ ] `on` выводит тип payload из имени события.
- [ ] `emit` требует правильный payload для события.
- [ ] Payloadless-события вызываются без payload.
- [ ] Неправильный payload приводит к compile-time ошибке.
- [ ] Отсутствующий обязательный payload приводит к compile-time ошибке.
- [ ] `any` не используется в публичном API Mediator.
- [ ] Существующие вызовы Mediator успешно компилируются после адаптации типов.
- [ ] Runtime-семантика Mediator не изменена.
- [ ] TypeScript build проходит успешно.

---

## 8. Результат

После выполнения задачи типовая связь должна выглядеть так:

```text
AppEventMap
    ↓
BaseMediator<AppEventMap>
    ↓
AppMediator
    ↓
on(event, handler)
emit(event, payload)
    ↓
TypeScript проверяет event ↔ payload
```

Таким образом `AppEventMap`, который уже является источником описания событий приложения, становится реальным контрактом Mediator, а не просто декларацией, которая обходится через `string` + `any`.
