# Client Package

Пакет клиентского приложения для визуализации графов точек и их эмбеддингов.

## Архитектурная точка отсчёта

Актуальное согласованное архитектурное положение зафиксировано в отдельном документе:

**[CURRENT_POSITION.md](./CURRENT_POSITION.md)**

Этот документ описывает текущую архитектурную модель и ограничения для последующих изменений. Актуальные расхождения и оставшиеся архитектурные цели зафиксированы в отдельном аудите.

## История рефакторинга

Рефакторинг `PointsSceneTester` и связанной графовой инфраструктуры, а также его архитектурная цель, зафиксированы здесь:

**[PointsSceneTester-Refactoring-Summary.md](./docs/PointsSceneTester-Refactoring-Summary.md)**

## View: UI и Graph

В проекте различаются два представления:

- **View UI** — React-компоненты, панели управления и информационные панели. Они взаимодействуют с системой через `AppMediator`.
- **View Graph** — графическое представление точек и рёбер. Сейчас реализовано через D3/SVG (`PointsScene`, `EdgesScene`). Оно получает Model напрямую через `PointGraphManager` и использует live references.

Поэтому граница Model → View различается:

```text
Model → View Graph
        напрямую через PointGraphManager / live Model references

Model/System → View UI
              через AppMediator (events + UI state)
```

`AppMediator` не является хранилищем графа и не должен использоваться для передачи больших массивов `PointModel`, `EdgeModel` или таблиц.

---

## Структура исходного кода

```text
src/
├── core/           # Ядро приложения, модели, граф, физика и инфраструктура
├── ui/             # View UI: React-компоненты
├── clients/        # API-клиенты
├── styles/         # Стили
├── index.ts        # Точка входа
└── global.d.ts     # Глобальные типы TypeScript
```

---

## Основные компоненты

| Класс | Ответственность |
|---|---|
| `DataManager` | Работа с таблицами данных, IndexedDB и API. Передаёт таблицы непосредственно в `PointsTransformer`. |
| `PointsTransformer` | Граница Table ↔ Model. Преобразует `PointTable`, `EmbeddingTable`, `EdgeTable` в `PointModel` и `EdgeRefs`, а при сохранении выполняет обратное преобразование. |
| `PointGraphManager` | Владеет коллекцией `PointModel` и `NeighborGraph`. Является единой точкой управления количеством Model-сущностей. Создаётся в контексте `ModelManager`. |
| `NeighborGraph` | Хранит `EdgeModel` и индекс смежности. `edgeCollection` является источником истины. |
| `ModelManager` | Строит и постепенно улучшает граф ближайших соседей, создаёт `PointGraphManager` и предоставляет ему фабрику `EdgeModel`. |
| `PointsScene` | View Graph для точек. Работает непосредственно с `PointModel[]`. |
| `EdgesScene` | View Graph для рёбер. Работает непосредственно с `EdgeModel[]`. |
| `AppMediator` | Сигналы, команды и небольшой UI-state. Не хранит графовые данные. |
| `AnimationEngine` | Единственный владелец `requestAnimationFrame` и общий механизм выполнения callbacks. |
| `RepulsionEngine` | Physics: отталкивание точек. |
| `GraphEngine` | Physics: притяжение связанных точек. |
| `ZDampingEngine` | Physics: затухание по Z. |

---

## Model и граф

### PointGraphManager

`PointGraphManager` содержит:

```text
EntityCollection<PointModel>
NeighborGraph
```

Один экземпляр используется совместно `PointsScene`, `EdgesScene`, `PointsTransformer` и `ModelManager`.

Для Graph View коллекции предоставляют живые массивы. Это означает, что сцены работают с теми же объектами Model, которые находятся в `PointGraphManager`; отдельная синхронизация копий не требуется.

Количество сущностей должно изменяться через `PointGraphManager`. В частности, удаление точки сначала удаляет связанные рёбра, затем саму точку.

Изменение полей существующего Model (`x`, `y`, `z`, `selected`, `dragged`, `pinned` и т. п.) допускается непосредственно View Graph и physics.

### NeighborGraph

`NeighborGraph` хранит два синхронизированных представления одного графа:

```text
edgeCollection: EntityCollection<EdgeModel>
adjacency: Map<pointId, Set<edgeId>>
```

`edgeCollection` — источник истины. `adjacency` — индекс смежности.

Каждое ребро зарегистрировано в adjacency обоих концов. В adjacency не должно быть неизвестных `edgeId`.

Не следует выносить `edgeCollection` из `NeighborGraph` и превращать `NeighborGraph` в индекс над внешним хранилищем.

---

## ModelManager

`ModelManager` постепенно улучшает граф.

Текущий алгоритм рассматривает:

1. текущих соседей;
2. соседей соседей;
3. случайных кандидатов.

Критерий текущей реализации — среднее косинусное расстояние по общим моделям эмбеддингов.

Ограничение количества связей задаётся параметром `K`.

Преобразование `EdgeRef → EdgeModel` создаётся в контексте `ModelManager`, передаётся в `PointGraphManager`, а затем в `NeighborGraph`. `PointGraphManager` не содержит собственной реализации фабрики.

`EdgeRef` пока не перепроектируется: его оставшаяся смешанная ответственность требует отдельного анализа.

---

## Поток данных

```mermaid
graph TD
    A[Backend API] --> B[DataManager]
    C[IndexedDB] <--> B
    B -->|PointTable + EmbeddingTable + EdgeTable| D[PointsTransformer]
    D -->|PointModel + EdgeRefs| E[PointGraphManager]

    E -->|live PointModel[]| F[PointsScene / View Graph]
    E -->|live EdgeModel[]| G[EdgesScene / View Graph]
    E --> H[ModelManager]

    M[AppMediator]
    M -.->|events / commands / UI state| F
    M -.->|events / commands / UI state| G
    M -.->|signals| H
    M -.->|reload / save commands| B

    E -->|Model changes| F
    E -->|Model changes| G
```

### Основные правила

1. `DataManager` передаёт таблицы в `PointsTransformer` напрямую.
2. `PointsTransformer` является границей Table ↔ Model.
3. `PointGraphManager` является источником истины для текущих точек и графа.
4. `PointsScene`, `EdgesScene`, `PointsTransformer` и `ModelManager` используют один экземпляр `PointGraphManager`.
5. View Graph получает Model напрямую, а не через `AppMediator`.
6. View UI получает события и UI-state через `AppMediator`.
7. Большие массивы Model и Table через `AppMediator` не передаются.
8. Количество Model-сущностей изменяется через `PointGraphManager`.
9. Изменения полей существующих Model могут выполняться View Graph и physics.
10. Если изменение Model должно быть замечено другими подсистемами, публикуется соответствующий небольшой сигнал.
11. Только `AnimationEngine` непосредственно вызывает `requestAnimationFrame`.

---

## Selection

Состояние выбора принадлежит `PointModel.selected`, поскольку оно участвует в вычислении `PointModel.fixed`.

`AppMediator.selectPoint()` только публикует `UIPoint | null` для UI. Отдельного `selectedPoint` state в медиаторе нет.

---

## Position update

Drag непосредственно изменяет `PointModel.x/y`. При завершении drag `PointsScene` публикует `pointUpdated(pointId)`, после чего `PointsTransformer` может сохранить актуальную точку.

---

## Сохранение

Сохранение текущей сцены выполняется через:

```text
View UI
  ↓
AppMediator.savePositions()
  ↓
PointsTransformer
  ↓
PointGraphManager
  ↓
PointTable[] / EdgeTable[]
  ↓
DataManager
  ↓
IndexedDB
```

Model не передаётся через Mediator.

---

## Physics и AnimationEngine

Текущие physics engines:

```text
RepulsionEngine
      ↓
GraphEngine
      ↓
ZDampingEngine
```

Они используют общий `AnimationEngine` для выполнения по кадрам и непосредственно изменяют поля существующих `PointModel`.

Physics engines имеют `destroy()`, который освобождает animation callback и подписку на `AppMediator`.

`EnginePipeline` пока не реализован. Это следующая архитектурная цель для организации последовательности physics engines и единого механизма уведомления об изменениях позиций.

---

## Текущее состояние архитектуры

Документ [CURRENT_POSITION.md](./CURRENT_POSITION.md) фиксирует согласованную модель.

Результат выравнивания и оставшиеся вопросы зафиксированы в:

**[CLIENT_ARCHITECTURE_AUDIT.md](./CLIENT_ARCHITECTURE_AUDIT.md)**
