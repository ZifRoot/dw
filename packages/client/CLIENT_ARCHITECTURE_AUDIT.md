# Аудит соответствия `packages/client` текущему положению

Дата: 2026-09-17

## 1. Область и метод

Исходной точкой была ветка `dev`. После проверки кода выполнено точечное архитектурное выравнивание в отдельной ветке `feature/client-architecture-alignment`.

Эталоном является [`CURRENT_POSITION.md`](./CURRENT_POSITION.md).

Аудит фиксирует, какие пункты из исходного списка расхождений устранены, а какие намеренно остаются архитектурными целями или требуют отдельного анализа.

## 2. Результат

| № | Вопрос | Результат |
|---|---|---|
| 1 | `EdgeRef → EdgeModel` находится в `PointGraphManager` | **Исправлено** — фабрика создаётся в контексте `ModelManager` и передаётся в `PointGraphManager` → `NeighborGraph` |
| 2 | `ModelManager` напрямую вызывает RAF | **Исправлено** — `ModelManager` использует `AnimationEngine` |
| 3 | `PointsScene.removePoints()` меняет `EntityCollection` напрямую | **Исправлено** — удаление проходит через `PointGraphManager.removePoints()` |
| 4 | При удалении точек не удаляются рёбра | **Исправлено** — `PointGraphManager.removePoints()` сначала удаляет инцидентные рёбра |
| 5 | Physics engines не отписываются от `AppMediator` | **Исправлено** — добавлены `destroy()` и сохранение unsubscribe-функций |
| 6 | `EnginePipeline` отсутствует | **Намеренно оставлено** — это архитектурная цель следующего этапа |
| 7 | Drag не публикует `pointUpdated()` | **Исправлено для drag path** — событие публикуется при завершении drag |
| 8 | `PointModel.selected` и `mediator.selectedPoint` дублируют state | **Исправлено** — authoritative state находится в `PointModel.selected`, Mediator только публикует UI-уведомление |
| 9 | Смешанная ответственность вокруг `EdgeRef` | **Намеренно оставлено частично** — фабрика вынесена, окончательная роль `EdgeRef` не перепроектирована |

## 3. Что осталось неизменным

### 3.1 `NeighborGraph` владеет своей коллекцией рёбер

`edgeCollection: EntityCollection<EdgeModel>` остаётся внутри `NeighborGraph`.

Архитектура не заменялась внешним хранилищем рёбер или отдельным индексом над коллекцией.

### 3.2 `EnginePipeline`

Класс `EnginePipeline` не создавался. Сейчас engines по-прежнему регистрируют callbacks в общем `AnimationEngine`.

Это намеренно оставленная архитектурная цель.

### 3.3 `EdgeRef`

Изменён только контекст создания `EdgeModel`.

Не выполнялись дополнительные преобразования:

```text
EdgeModel → EdgeRef → EdgeModel
```

и не менялась семантика `EdgeRef` без отдельного анализа всех путей его использования.

## 4. Lifecycle

Для `RepulsionEngine`, `GraphEngine` и `ZDampingEngine` теперь предусмотрен lifecycle:

```text
constructor
    ↓
mediator subscription
    ↓
AnimationEngine callback
    ↓
destroy()
    ├── unsubscribe animation callback
    └── unsubscribe mediator callback
```

`PointsScene` также сохраняет и освобождает созданные subscriptions к `AppMediator`.

## 5. Selection

Состояние выбора принадлежит `PointModel.selected`, поскольку оно участвует в вычислении `PointModel.fixed`.

`AppMediator` больше не хранит `selectedPoint` как состояние. Метод `selectPoint()` публикует `UIPoint | null` для React UI.

Таким образом:

```text
PointModel.selected
        │
        ├── physics
        └── PointsScene

AppMediator.selectPoint(...)
        ↓
      View UI
```

UI получает проекцию для отображения, но не является вторым хранилищем domain selection state.

## 6. Position update

Drag непосредственно изменяет `PointModel.x/y`, что соответствует правилу live Model references.

После завершения drag публикуется:

```text
pointUpdated(pointId)
```

`PointsTransformer` затем получает актуальный `PointModel` из `PointGraphManager` и сохраняет его.

Для physics остаётся отдельный механизм `pointsUpdating()`. Полная унификация всех типов Model mutation всё ещё является отдельным архитектурным вопросом.

## 7. Следующий архитектурный этап

После этого выравнивания отдельного анализа требуют:

1. контракт `EnginePipeline`;
2. полная семантика событий изменения Model;
3. окончательная роль `EdgeRef` и необходимость/место преобразований `EdgeModel ↔ EdgeRef`;
4. отдельная проверка event flow `START_GRAPH` / `GraphEngine`, который не входил в исходные девять пунктов.

Эти вопросы не должны приводить к изменению владения `NeighborGraph` или к переносу его `edgeCollection` наружу.
