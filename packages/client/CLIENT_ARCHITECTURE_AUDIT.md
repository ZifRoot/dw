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

`PointsScene` получает `PointGraphManager` и сохраняет ссылку на живой массив через `getPointsArray()`. `EdgesScene` аналогично получает живой массив рёбер через `getEdgesArray()`. Это соответствует правилу:

```text
Model → View Graph напрямую
```

`PointsScene` действительно работает с `PointModel`, а `EdgesScene` — с `EdgeModel`, а не с массивами моделей, переданными через Mediator.

Факты в `dev`: `PointsScene.syncRefs()` использует `pointGraphManager.getPointsArray()`, `EdgesScene.syncRefs()` — `pointGraphManager.getEdgesArray()`. fileciteturn166file0L2-L2 fileciteturn167file0L2-L2

### 3.2 Mediator не используется как хранилище графа

`AppMediator` содержит сигналы и небольшой UI-state. Для `POINT_UPDATED` передаётся только `pointId`, а не `PointModel`. Это соответствует текущему положению.

`PointsTransformer` получает актуальную точку из `PointGraphManager` по ID. fileciteturn157file0L2-L2 fileciteturn156file0L2-L2

### 3.3 Table ↔ Model находится в PointsTransformer

`PointsTransformer` преобразует:

```text
PointTable → PointModel
EmbeddingTable → PointModel.embeddings
EdgeTable → EdgeRef
```

и при сохранении преобразует Model обратно в Table. Это соответствует архитектуре. fileciteturn156file0L2-L2

### 3.4 PointGraphManager является общей точкой доступа

`index.ts` создаёт один `PointGraphManager` и передаёт тот же экземпляр в `PointsScene`, `EdgesScene`, `PointsTransformer` и `ModelManager`. Это соответствует требованию единого экземпляра.

fileciteturn168file0L2-L2

### 3.5 NeighborGraph хранит собственную коллекцию рёбер

В `dev` `NeighborGraph` содержит собственный `edgeCollection` и `adjacency`. `edgeCollection` документирован как источник истины. Это соответствует явно зафиксированному решению не выносить хранилище рёбер наружу.

fileciteturn154file0L2-L2

### 3.6 Physics уже использует AnimationEngine

`RepulsionEngine`, `GraphEngine` и `ZDampingEngine` регистрируют свои callbacks в `AnimationEngine`, а сам `AnimationEngine` вызывает `requestAnimationFrame`. Это соответствует общей модели animation callback.

fileciteturn161file0L2-L2 fileciteturn169file0L2-L2 fileciteturn170file0L2-L2 fileciteturn171file0L2-L2

---

## 4. Расхождения

## 4.1 `ModelManager` напрямую вызывает `requestAnimationFrame`

**Эталон:** только `AnimationEngine` непосредственно вызывает `requestAnimationFrame`.

**Фактический код:** `ModelManager` содержит собственные `rafId`, `generation`, `startOptimization()`, `stopOptimization()` и вызывает `requestAnimationFrame()` непосредственно.

fileciteturn153file0L2-L2

### Следствие

В системе фактически существует второй независимый animation loop:

```text
AnimationEngine → requestAnimationFrame
ModelManager    → requestAnimationFrame
```

Это противоречит зафиксированному правилу единого владельца RAF.

### Отдельный вопрос

`ModelManager` — не physics engine, поэтому после устранения прямого RAF нужно отдельно определить, как именно его инкрементальная оптимизация будет использовать `AnimationEngine`. Архитектурное правило уже определено, конкретный API для этого ещё нет.

---

## 4.2 `PointGraphManager` сам реализует `EdgeRef → EdgeModel`

**Эталон:** создание `EdgeModel` должно быть вынесено в фабрику в контексте `ModelManager`, затем фабрика передаётся через `PointGraphManager` в `NeighborGraph`.

**Фактический код:** `PointGraphManager` содержит `edgeIndexToEdgeModel()` и передаёт в `NeighborGraph` фабрику:

```text
PointGraphManager
    └── edgeIndexToEdgeModel()
          ↓
       NeighborGraph
```

Кроме того, конструктор `PointGraphManager` принимает `AppMediator`, хотя его задача по архитектуре — управление Model/Graph. fileciteturn151file0L2-L2

`IEdgeModelFactory` при этом существует, а `NeighborGraph` действительно принимает её через конструктор. fileciteturn155file0L2-L2 fileciteturn154file0L2-L2

### Статус

Это не нарушение инварианта графа. Это расхождение ответственности, которое уже было отдельно отмечено в текущем положении. Перепроектировать его вместе с `EdgeRef` без анализа всех путей использования не следует.

---

## 4.3 `PointsScene` напрямую меняет количество PointModel

**Эталон:** количество Model-сущностей изменяется через `PointGraphManager`.

**Фактический код:** `PointsScene.removePoints()` получает `EntityCollection` напрямую и вызывает:

```text
this.pointGraphManager.getPointCollection().removes(ids)
```

fileciteturn166file0L2-L2

### Почему это важно

Это обход API `PointGraphManager`. В результате `PointGraphManager` перестаёт быть единственной точкой управления жизненным циклом `PointModel`.

### Дополнительная проблема

`removePoints()` удаляет DOM-элементы и точки, но не вызывает `PointGraphManager.remove...` для связанных рёбер. Следовательно, код этого метода не использует механизм удаления dangling edges, описанный для `PointGraphManager`.

Это уже не только архитектурное расхождение, но и потенциальный источник рассинхронизации Model/Graph.

---

## 4.4 Уведомление об изменениях Model при drag не унифицировано

`PointsScene` непосредственно меняет `PointModel.x` и `PointModel.y` в `onDrag` и `updatePointPosition()`. При завершении drag устанавливается `dragged = false`, но соответствующий сигнал `pointUpdated()` в этом пути не вызывается.

fileciteturn166file0L2-L2

При этом `AppMediator` и `PointsTransformer` уже имеют отдельный механизм `POINT_UPDATED → pointId → сохранение точки`. fileciteturn157file0L2-L2 fileciteturn156file0L2-L2

### Статус

Прямое изменение полей Model разрешено текущей архитектурой. Не определено только единое правило, **когда именно такое изменение должно порождать системное событие**.

---

## 4.5 Дублирование состояния выбора PointModel / UI

`PointModel` содержит `selected`. fileciteturn173file0L2-L2

Одновременно `AppMediator` хранит `selectedPoint` типа `UIPoint | null`, а `PointsScene` при выборе точки изменяет оба представления. fileciteturn157file0L2-L2 fileciteturn166file0L2-L2

### Статус

Это соответствует ранее отмеченной проблеме дублирования UI-state и Model-state. Пока не принято отдельное решение, какое состояние является источником истины для selection.

---

## 4.6 Physics engines не полностью оформлены как Pipeline

Фактически сейчас:

```text
AnimationEngine
    ├── RepulsionEngine
    ├── GraphEngine
    └── ZDampingEngine
```

Каждый engine сам регистрирует callback в `AnimationEngine`. `EnginePipeline` отсутствует. Это соответствует текущему фактическому состоянию, но не будущему архитектурному направлению.

Кроме того, в `index.ts` engines создаются независимо, а порядок вызова определяется порядком callback'ов `Set`, а не отдельным объектом `EnginePipeline`. fileciteturn168file0L2-L2 fileciteturn161file0L2-L2

### Статус

Расхождение с архитектурной целью, а не с текущим обязательным API.

---

## 4.7 Подписки physics engines на Mediator не имеют lifecycle unsubscribe

`RepulsionEngine`, `GraphEngine` и `ZDampingEngine` подписываются на `onStartRepulsion()` в конструкторах, но в самих классах нет `destroy()` и нет сохранённой функции отписки.

fileciteturn169file0L2-L2 fileciteturn170file0L2-L2 fileciteturn171file0L2-L2

Это не противоречит непосредственно data flow, но противоречит требованию управляемого lifecycle компонентов и становится важным при повторной инициализации/уничтожении подсистем.

---

## 4.8 `PointsScene` не отписывает все созданные Mediator subscriptions

`PointsScene.destroy()` отписывает `unsubPointsGraphUpdated` и drag detector. Однако в `subscribeToMediatorEvents()` вызываются `onPointUpdate`, `onPointsUpdating`, `onSizeText`, а возвращаемые unsubscribe-функции не сохраняются.

fileciteturn166file0L2-L2

Это lifecycle-расхождение. Особенно важно для сценария повторного создания/уничтожения Scene.

---

## 4.9 `EdgesScene` использует live array, но обновление ссылки формально не требуется

`EdgesScene` вызывает `syncRefs()` только в конструкторе, при этом `PointGraphManager.getEdgesArray()` возвращает живой массив. Поэтому изменение состава массива через `NeighborGraph` будет видно сцене без повторного `syncRefs()`.

Это **не расхождение** с архитектурой. Наоборот, это подтверждает смысл решения о live references.

При этом `EdgesScene` реагирует на `POINTS_GRAPH_UPDATED` через `renderLines()`, что обеспечивает синхронизацию DOM после изменения состава графа. fileciteturn167file0L2-L2

---

## 4.10 Потенциальное несоответствие команды запуска Graph

В `AppMediator` существует отдельная команда `START_GRAPH`, но `GraphEngine` в конструкторе подписывается на `onStartRepulsion()`, а не на `onStartGraph()`.

`index.ts` также создаёт `GraphEngine`, но не показывает отдельной связи `START_GRAPH → GraphEngine.start()`. fileciteturn157file0L2-L2 fileciteturn169file0L2-L2 fileciteturn168file0L2-L2

Это функциональное расхождение, связанное с event flow, а не с Model → View границей. Его стоит проверить отдельно до изменения архитектуры.

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
