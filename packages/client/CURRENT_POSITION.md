# Текущее положение `packages/client`

Дата фиксации: 2026-09-17
База: ветка `dev`

Этот документ фиксирует архитектурное положение `packages/client`, согласованное в ходе анализа и последующего точечного выравнивания кода. Он является точкой отсчёта для следующих изменений.

## 1. Главный принцип

В клиенте разделяются **View UI** и **View Graph**.

- **View UI** — React-панели и элементы управления. Для связи с системой используется `AppMediator`.
- **View Graph** — графическое представление графа (сейчас D3/SVG; архитектура должна позволять Three.js и другие реализации). View Graph использует `Model` напрямую через `PointGraphManager` и live references.

Поэтому граница Model → View различается:

```text
Model → View Graph
        напрямую через PointGraphManager / live Model references

Model/System → View UI
              через AppMediator (events + UI state)
```

`AppMediator` не является хранилищем графа и не должен передавать большие массивы `PointModel`, `EdgeModel`, таблиц или других крупных структур.

## 2. Поток данных

```text
DB / Backend
    │
    ▼
DataManager
    │  PointTable[] / EmbeddingTable[] / EdgeTable[]
    ▼
PointsTransformer
    │  PointModel[] / EdgeRefs
    ▼
PointGraphManager
    │
    ├──────────────→ View Graph (PointsScene / EdgesScene)
    │                    │
    │                    └── D3 / SVG / в будущем Three.js
    │
    └──────────────→ ModelManager
```

При этом `ModelManager` является контекстом построения графа и создаёт общий `PointGraphManager`, передавая ему фабрику `IEdgeModelFactory`.

События и UI-state идут отдельным потоком:

```text
System / Model / View Graph
          │
          ▼
     AppMediator
          │
          ▼
       View UI
```

## 3. DataManager

`DataManager` отвечает за работу с таблицами данных, IndexedDB и API.

Он:

- получает/сохраняет таблицы;
- объединяет данные из локального хранилища и сервера в рамках своей ответственности;
- передаёт `PointTable[]`, `EmbeddingTable[]`, `EdgeTable[]` непосредственно в `PointsTransformer`;
- не передаёт крупные таблицы через `AppMediator`.

## 4. PointsTransformer

`PointsTransformer` — граница между **Table** и **Model**.

Основные преобразования:

```text
PointTable[]      → PointModel[]
EmbeddingTable[]  → PointModel.embeddings
EdgeTable[]       → EdgeRefs
```

После преобразования `PointsTransformer` обновляет `PointGraphManager`.

Обратное направление используется при сохранении:

```text
PointModel[] / EdgeModel[]
        ↓
PointTable[] / EdgeTable[]
        ↓
DataManager
```

## 5. PointGraphManager

`PointGraphManager` — владелец текущего набора `PointModel` и графа связей.

Он содержит:

- `EntityCollection<PointModel>`;
- `NeighborGraph`.

Он является единой точкой управления количеством `PointModel` и `EdgeModel`.

Добавление/удаление сущностей должно проходить через `PointGraphManager`. В частности, `removePoints()` сначала удаляет все инцидентные рёбра, затем точки и публикует `pointsGraphUpdated()`.

Другие компоненты могут менять поля существующих моделей (например, координаты, `selected`, `dragged`, `pinned`), но не должны напрямую изменять количество Model-сущностей через `EntityCollection`.

Один экземпляр `PointGraphManager` используется совместно `PointsScene`, `EdgesScene`, `PointsTransformer` и `ModelManager`. Экземпляр создаётся в контексте `ModelManager`.

## 6. NeighborGraph

`NeighborGraph` — внутреннее хранилище графа.

Он владеет:

```text
edgeCollection: EntityCollection<EdgeModel>
adjacency: Map<pointId, Set<edgeId>>
```

`edgeCollection` является источником истины для рёбер. `adjacency` является индексом смежности.

Инвариант:

- каждое ребро из `edgeCollection` зарегистрировано в `adjacency` обоих концов;
- `adjacency` не содержит неизвестных `edgeId`;
- каждая запись `adjacency` соответствует endpoint существующего ребра.

`NeighborGraph` не следует превращать в отдельный индекс над внешней коллекцией рёбер: коллекция рёбер принадлежит самому `NeighborGraph`.

## 7. EntityCollection

`EntityCollection` хранит сущности в `items` и индексирует их через `indexMap`.

`items` — **живая ссылка**, а не копия. Это намеренное решение для View Graph и физических движков.

Удаление использует `swap-with-last`, поэтому порядок `items` не является стабильным, но сама ссылка на массив остаётся живой.

## 8. ModelManager

`ModelManager` отвечает за построение и постепенное улучшение графа.

Цель:

- не более `K` рёбер на точку;
- по возможности не менее `K` рёбер для точек, у которых достаточно кандидатов.

Текущий алгоритм использует кандидатов из:

1. текущих соседей точки;
2. соседей соседей;
3. случайной выборки.

Критерий текущей версии — косинусное расстояние, вычисляемое по общим моделям эмбеддингов.

Конкретные параметры `K`, размеры выборок и бюджет кадра являются параметрами алгоритма, а не архитектурными инвариантами.

### Фабрика EdgeModel

Преобразование `EdgeRef → EdgeModel` находится в контексте `ModelManager`.

```text
ModelManager
    │ owns/defines IEdgeModelFactory
    ▼
PointGraphManager
    ▼
NeighborGraph
```

`NeighborGraph` получает фабрику и использует её для создания `EdgeModel`. `PointGraphManager` больше не содержит собственную реализацию `EdgeRef → EdgeModel`.

`EdgeRef` пока не удаляется и не перепроектируется: его роль и оставшаяся смешанная ответственность требуют отдельного анализа.

### Animation

`ModelManager` не владеет `requestAnimationFrame`. Он регистрирует callback в `AnimationEngine`, который является единственным владельцем RAF.

## 9. View Graph

View Graph работает непосредственно с Model.

Например:

```text
PointGraphManager
    │
    ├── live PointModel[] → PointsScene
    └── live EdgeModel[]   → EdgesScene
```

`PointsScene` и `EdgesScene` не получают массивы моделей через `AppMediator`.

D3/SVG является текущей реализацией Graph View. Архитектура не должна связывать Model с конкретной графической библиотекой.

## 10. View UI и AppMediator

React UI работает через `AppMediator`.

Через него передаются:

- команды пользователя;
- события системы;
- небольшие значения UI-state;
- идентификаторы изменённых сущностей, когда этого достаточно.

Например, `POINT_UPDATED` содержит `pointId`, а сам `PointModel` берётся из `PointGraphManager`.

### Selection

Состояние выбора принадлежит `PointModel.selected`, поскольку оно влияет на `PointModel.fixed` и, следовательно, на physics.

`AppMediator.selectPoint()` только публикует UI-уведомление с `UIPoint | null`; медиатор больше не хранит отдельный `selectedPoint` state.

Таким образом, постоянного дублирования selection state между Model и Mediator нет.

## 11. Изменение полей Model

Прямое изменение полей существующего Model допустимо для Graph View и physics.

Например:

```text
Physics → PointModel.x/y/z
PointsScene drag → PointModel.x/y
```

При завершении drag `PointsScene` публикует `pointUpdated(pointId)`, поэтому существующий механизм сохранения изменённой точки может использовать тот же сигнал.

Для physics используется отдельный частый сигнал `pointsUpdating()`; окончательная унификация событий изменения Model остаётся отдельным архитектурным вопросом.

## 12. Physics

Есть три текущих движка:

1. `RepulsionEngine` — отталкивание точек;
2. `GraphEngine` — притяжение связанных точек;
3. `ZDampingEngine` — затухание по Z.

Они регистрируют callbacks в общем `AnimationEngine` и имеют lifecycle `destroy()`, который отписывает как animation callback, так и подписку на `AppMediator`.

Концептуальный порядок:

```text
RepulsionEngine
      ↓
GraphEngine
      ↓
ZDampingEngine
```

В перспективе физическая система должна быть организована через `EnginePipeline`, который определяет состав и порядок engines.

## 13. AnimationEngine

`AnimationEngine` является владельцем `requestAnimationFrame`.

Архитектурное правило:

> Только `AnimationEngine` непосредственно вызывает `requestAnimationFrame`.

Компоненты, которым требуется выполнение по кадрам, должны регистрировать callback в `AnimationEngine`.

Это правило теперь также выполняется для `ModelManager`.

## 14. EnginePipeline

`EnginePipeline` пока является архитектурной целью, а не существующим классом.

Его задача:

- организовать последовательное выполнение physics engines;
- централизовать animation step;
- в будущем обеспечить единый механизм уведомления системы об изменениях позиций.

Не следует считать `EnginePipeline` уже реализованным только потому, что он описан в архитектуре.

## 15. Сохранение

Поток сохранения сцены:

```text
View UI
   ↓
AppMediator.savePositions
   ↓
PointsTransformer
   ↓
PointGraphManager
   ├── PointModel[]
   └── EdgeModel[] / EdgeRefs
   ↓
PointTable[] / EdgeTable[]
   ↓
DataManager
   ↓
IndexedDB
```

Большие данные не должны проходить через `AppMediator`.

## 16. Архитектурные ограничения для следующих изменений

1. Не переносить хранение рёбер из `NeighborGraph` наружу.
2. Не использовать `AppMediator` как хранилище Model.
3. Не передавать большие массивы Model через `AppMediator`.
4. Не создавать отдельные копии `PointModel[]` / `EdgeModel[]` для Graph View без необходимости.
5. Количество Model-сущностей изменяется через `PointGraphManager`.
6. Поля существующих Model могут изменяться непосредственно View Graph и physics.
7. `PointsTransformer` остаётся границей Table ↔ Model.
8. `EdgeRef` пока не перепроектировать без отдельного анализа.
9. `requestAnimationFrame` вызывается только из `AnimationEngine`.
10. `EnginePipeline` считать будущей организацией physics, а не существующим компонентом.
