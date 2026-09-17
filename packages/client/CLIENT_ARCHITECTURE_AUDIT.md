# Аудит соответствия `packages/client` текущему положению

Дата: 2026-09-17

## 1. Область и метод

Проверена ветка `dev`, только каталог `packages/client`.

Эталоном сравнения является [`CURRENT_POSITION.md`](./CURRENT_POSITION.md), зафиксированный в этой ветке на основании согласованной архитектуры.

Аудит отвечает на вопрос:

> Что уже соответствует текущему положению, а что в коде `dev` пока реализовано иначе?

Это **не план рефакторинга**. Здесь фиксируются наблюдаемые расхождения и связанные с ними вопросы. Изменять код по этому списку автоматически не следует.

---

## 2. Краткий результат

Основная архитектурная схема уже присутствует в `dev`:

```text
DataManager
    ↓
PointsTransformer
    ↓
PointGraphManager
    ├──→ View Graph
    └──→ ModelManager

AppMediator
    └──→ events / commands / UI state
```

При этом есть несколько существенных расхождений:

1. `PointGraphManager` сейчас сам реализует `EdgeRef → EdgeModel`, хотя согласованное направление — вынести создание фабрики в контекст `ModelManager`.
2. `ModelManager` напрямую использует `requestAnimationFrame`, нарушая правило единого владельца RAF — `AnimationEngine`.
3. `PointsScene.removePoints()` напрямую изменяет `EntityCollection<PointModel>`, хотя количество Model-сущностей должно изменяться через `PointGraphManager`.
4. `PointsScene` при удалении точек не удаляет соответствующие рёбра через `PointGraphManager`; это может нарушать инвариант графа.
5. Physics engines используют `AnimationEngine`, но подписки на `AppMediator` не отписываются при уничтожении engines.
6. `EnginePipeline` отсутствует — он пока остаётся архитектурной целью.
7. Изменения позиций, сделанные drag в `PointsScene`, не сопровождаются `pointUpdated()`; механизм уведомления об изменениях Model пока не унифицирован.
8. `PointModel.selected` и `AppMediator.selectedPoint: UIPoint | null` содержат дублирующее представление состояния выбора.
9. В `ModelManager` и `PointGraphManager` осталась смешанная ответственность вокруг `EdgeRef`, которую архитектура пока специально оставляет нерешённой до отдельного анализа.

---

## 3. Что соответствует архитектуре

### 3.1 View Graph получает Model напрямую

`PointsScene` получает `PointGraphManager` и сохраняет ссылку на живой массив через `getPointsArray()`. `EdgesScene` аналогично получает живой массив рёбер через `getEdgesArray()`.

Это соответствует правилу:

```text
Model → View Graph напрямую
```

### 3.2 Mediator не используется как хранилище графа

`AppMediator` содержит сигналы и небольшой UI-state. Для `POINT_UPDATED` передаётся только `pointId`, а не `PointModel`. `PointsTransformer` получает актуальную точку из `PointGraphManager` по ID.

### 3.3 Table ↔ Model находится в PointsTransformer

`PointsTransformer` преобразует:

```text
PointTable → PointModel
EmbeddingTable → PointModel.embeddings
EdgeTable → EdgeRef
```

и при сохранении преобразует Model обратно в Table.

### 3.4 PointGraphManager является общей точкой доступа

`index.ts` создаёт один `PointGraphManager` и передаёт тот же экземпляр в `PointsScene`, `EdgesScene`, `PointsTransformer` и `ModelManager`.

### 3.5 NeighborGraph хранит собственную коллекцию рёбер

В `dev` `NeighborGraph` содержит собственный `edgeCollection` и `adjacency`. `edgeCollection` является источником истины.

### 3.6 Physics уже использует AnimationEngine

`RepulsionEngine`, `GraphEngine` и `ZDampingEngine` регистрируют callbacks в `AnimationEngine`, а `AnimationEngine` непосредственно вызывает `requestAnimationFrame`.

---

## 4. Расхождения

### 4.1 `ModelManager` напрямую вызывает `requestAnimationFrame`

**Эталон:** только `AnimationEngine` непосредственно вызывает `requestAnimationFrame`.

**Фактический код:** `ModelManager` содержит собственные `rafId`, `generation`, `startOptimization()`, `stopOptimization()` и вызывает `requestAnimationFrame()` непосредственно.

Следовательно, фактически существуют два независимых animation loop:

```text
AnimationEngine → requestAnimationFrame
ModelManager    → requestAnimationFrame
```

Это противоречит правилу единого владельца RAF.

`ModelManager` — не physics engine, поэтому конкретный API его работы через `AnimationEngine` требует отдельного проектирования.

---

### 4.2 `PointGraphManager` сам реализует `EdgeRef → EdgeModel`

**Эталон:** создание `EdgeModel` должно быть вынесено в фабрику в контексте `ModelManager`, затем фабрика передаётся через `PointGraphManager` в `NeighborGraph`.

**Фактический код:** `PointGraphManager` содержит `edgeIndexToEdgeModel()` и передаёт в `NeighborGraph` фабрику.

```text
PointGraphManager
    └── edgeIndexToEdgeModel()
          ↓
       NeighborGraph
```

`IEdgeModelFactory` уже существует и используется `NeighborGraph`, но создаётся фактически внутри `PointGraphManager`.

Это расхождение ответственности. Его не следует перепроектировать одновременно с `EdgeRef` без отдельного анализа всех путей использования `EdgeRef`.

---

### 4.3 `PointsScene` напрямую меняет количество PointModel

**Эталон:** количество Model-сущностей изменяется через `PointGraphManager`.

**Фактический код:** `PointsScene.removePoints()` получает `EntityCollection` напрямую и вызывает:

```text
this.pointGraphManager.getPointCollection().removes(ids)
```

Это обход API `PointGraphManager`.

Кроме того, `removePoints()` удаляет точки, но не вызывает удаление связанных рёбер через `PointGraphManager`. Это потенциально нарушает инвариант отсутствия dangling edges.

---

### 4.4 Уведомление об изменениях Model при drag не унифицировано

`PointsScene` непосредственно меняет `PointModel.x` и `PointModel.y` при drag. При завершении drag `pointUpdated()` не вызывается.

При этом уже существует механизм:

```text
POINT_UPDATED
    ↓
pointId
    ↓
PointsTransformer
    ↓
savePoints()
```

Прямое изменение полей Model разрешено. Не определено только единое правило, когда такое изменение должно порождать системное событие.

---

### 4.5 Дублирование состояния выбора PointModel / UI

`PointModel` содержит `selected`.

Одновременно `AppMediator` хранит `selectedPoint: UIPoint | null`, а `PointsScene` при выборе точки изменяет оба представления.

Пока не принято отдельное решение, какое состояние является источником истины для selection.

---

### 4.6 Physics engines не полностью оформлены как Pipeline

Фактически сейчас:

```text
AnimationEngine
    ├── RepulsionEngine
    ├── GraphEngine
    └── ZDampingEngine
```

Каждый engine сам регистрирует callback в `AnimationEngine`. `EnginePipeline` отсутствует.

Порядок выполнения фактически определяется порядком callbacks в `Set`, а не отдельным объектом `EnginePipeline`.

Это расхождение с архитектурной целью, но не с уже существующим обязательным API.

---

### 4.7 Physics engines не имеют полного lifecycle unsubscribe

`RepulsionEngine`, `GraphEngine` и `ZDampingEngine` подписываются на `AppMediator` в конструкторах, но не сохраняют unsubscribe-функции и не предоставляют `destroy()`.

Это lifecycle-проблема, которая проявится при повторной инициализации/уничтожении подсистем.

---

### 4.8 `PointsScene` не отписывает все созданные Mediator subscriptions

`PointsScene.destroy()` отписывает `POINTS_GRAPH_UPDATED` и drag detector. Но subscriptions, созданные в `subscribeToMediatorEvents()` (`onPointUpdate`, `onPointsUpdating`, `onSizeText`), не сохраняются для последующей отписки.

Это lifecycle-расхождение.

---

### 4.9 `EdgesScene` и live array

`EdgesScene` вызывает `syncRefs()` только при создании, но `getEdgesArray()` возвращает живой массив. Поэтому изменение состава массива через `NeighborGraph` будет видно сцене без повторного получения массива.

Это **не расхождение**. Это соответствует выбранной архитектуре live references.

---

### 4.10 Потенциальное несоответствие команды запуска Graph

В `AppMediator` существует отдельная команда `START_GRAPH`, но `GraphEngine` подписывается на `onStartRepulsion()`, а не на `onStartGraph()`.

`index.ts` также не показывает отдельной связи `START_GRAPH → GraphEngine.start()`.

Это функциональное расхождение event flow, которое стоит проверить отдельно до архитектурного рефакторинга.

---

## 5. Таблица соответствия

| Область | Текущее положение | `dev` | Комментарий |
|---|---|---|---|
| View UI | Mediator | Соответствует | UI работает через Mediator |
| View Graph | Model напрямую | Соответствует | Scenes получают live Model refs |
| Table ↔ Model | PointsTransformer | Соответствует | Преобразование сосредоточено там |
| Graph storage | NeighborGraph владеет edgeCollection | Соответствует | Не выносить наружу |
| PGM | единая точка управления Model | Частично | `PointsScene` напрямую меняет collection |
| EdgeRef → EdgeModel | фабрика через PGM | Не соответствует согласованному направлению | Сейчас логика находится в PGM |
| Mediator | события/UI-state, без больших Model | Соответствует | Крупные массивы не передаются |
| RAF | только AnimationEngine | Не соответствует | `ModelManager` имеет собственный RAF |
| Physics | engines + общий AnimationEngine | Частично | Pipeline отсутствует |
| Position events | изменение Model может порождать сигнал | Частично | drag path не публикует `pointUpdated()` |
| Selection state | UI и Model должны быть согласованы | Не разрешено | Есть дублирование `selected` / `selectedPoint` |
| Lifecycle | subscriptions должны освобождаться | Не соответствует полностью | Несколько subscriptions без unsubscribe |
| EnginePipeline | будущий компонент | Отсутствует | Это пока ожидаемая следующая стадия |

---

## 6. Что намеренно НЕ исправлялось

В рамках этого аудита не делались изменения кода и не принимались новые архитектурные решения по следующим вопросам:

- новый API `IEdgeModelFactory`;
- окончательная роль `EdgeRef`;
- устранение `EdgeModel → EdgeRef → EdgeModel`;
- источник истины для selection;
- точный API `EnginePipeline`;
- точная семантика событий изменения полей Model;
- перенос `ModelManager` на `AnimationEngine`.

Причина одна: сначала зафиксировано текущее положение и фактические расхождения, чтобы следующие изменения не повторили предыдущий ошибочный рефакторинг `NeighborGraph`.

---

## 7. Следующая точка для обсуждения

Перед реализацией рефакторинга логично отдельно определить два контракта:

1. **Lifecycle Model:** какие операции изменения количества точек/рёбер разрешены только через `PointGraphManager` и какие методы для этого нужны.
2. **Animation contract:** как `ModelManager` и будущий `EnginePipeline` должны работать с единственным `AnimationEngine`, не владея собственным `requestAnimationFrame`.

После этого можно рассматривать изменения по одному, проверяя их против `CURRENT_POSITION.md`.
