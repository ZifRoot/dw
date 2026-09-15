# Конфликт хранителей точек: PointsScene vs PointGraphManager

## 1. Проблема

В проекте `packages/client` обнаружена архитектурная проблема: **дублирование ответственности за хранение и управление коллекцией точек**. В системе существуют два независимых хранителя точек:

### 1.1 PointsScene
**Расположение:** `src/core/Scene/PointsScene.ts`

**Ответственность:** Визуальное представление точек на сцене (SVG-рендеринг).

**Хранилище:**
```typescript
private entities: EntityCollection<PointModel>;
private points: PointModel[] = [];
```

**Основные методы:**
- `setPoints(points: PointModel[])` — установка коллекции точек
- `getPoints(): PointModel[]` — получение массива точек
- `getPointById(id: string): PointModel | undefined` — поиск точки по ID
- `updatePointPosition(id, x, y)` — обновление позиции конкретной точки
- `removePoints(ids: string[])` — удаление точек

### 1.2 PointGraphManager
**Расположение:** `src/core/PointGraphManager.ts`

**Ответственность:** Управление коллекцией точек и графом связей (NeighborGraph).

**Хранилище:**
```typescript
private pointCollection: EntityCollection<PointModel>;
```

**Основные методы:**
- `updatePoints(points: PointModel[])` — обновление коллекции точек
- `getPoints(): PointModel[]` — получение массива точек
- `getPointIds(): string[]` — получение ID всех точек
- `getCommonModel(id1, id2): string | null` — поиск общей модели эмбеддинга
- `initRandom(K)`, `initFromRefs(refs)` — инициализация графа связей

### 1.3 Суть конфликта

Оба класса содержат **собственные независимые копии** одной и той же коллекции `PointModel[]`. Это создаёт следующие проблемы:

1. **Рассинхронизация данных**: При изменении точек в одном хранителе другой не узнает об изменениях автоматически. Например:
   - ModelManager через PointGraphManager изменяет связи между точками
   - PointsScene может содержать устаревшие данные о точках
   
2. **Дублирование памяти**: Одна и та же коллекция точек хранится в двух экземплярах `EntityCollection<PointModel>`.

3. **Нарушение Single Responsibility Principle**: 
   - PointsScene должен отвечать только за **визуализацию** (view)
   - PointGraphManager должен отвечать только за **логку графа** (model)
   - Но оба вынуждены хранить состояние точек

4. **Сложность поддержки**: Любое изменение структуры PointModel требует синхронизации в двух местах.

5. **Потенциальные баги**: При обновлении позиций точек во время анимации/физики необходимо вручную синхронизировать оба хранилища.

---

## 2. Потоки информации по сущностям

### 2.1 Общая схема потока данных

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            DataManager                                  │
│  (IndexedDB: PointTable, EmbeddingTable, EdgeTable)                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ emit: pointsTable, embeddingsTable
┌─────────────────────────────────────────────────────────────────────────┐
│                         PointsTransformer                               │
│  (Конвертирует таблицы в PointModel, мерджит эмбеддинги)                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ mediator.pointsModelReady({points, edges})
        ┌───────────────────────────┴───────────────────────────┐
        │                                                       │
        ▼                                                       ▼
┌──────────────────────┐                            ┌──────────────────────┐
│    PointsScene       │                            │    ModelManager      │
│  (Визуализация)      │                            │  (Логика графа)      │
│                      │                            │                      │
│  entities:           │                            │  pointGraphManager:  │
│  EntityCollection    │                            │  PointGraphManager   │
│  points: PointModel[]│                            │    └─pointCollection │
└──────────────────────┘                            │    └─graph:          │
        │                                           │      NeighborGraph   │
        │                                           └──────────────────────┘
        │                                                       │
        │                                                       ▼ improve() + rebuildEdges()
        │                                           ┌──────────────────────┐
        │                                           │   mediator.edges     │
        │                                           └──────────────────────┘
        │                                                       │
        ▼                                                       ▼
┌──────────────────────┐                            ┌──────────────────────┐
│    EdgesScene        │◄───────────────────────────│  (получает edges)    │
│  (Рендеринг линий)   │                            │                      │
│                      │                            │                      │
│  Использует:         │                            │                      │
│  - pointsScene.Entities│                          │                      │
│  - mediator.edges    │                            │                      │
└──────────────────────┘                            └──────────────────────┘
```

### 2.2 Детальный разбор потоков

#### Поток 1: Инициализация данных (загрузка из БД)

```
1. DataManager.reloadTables()
   └─► Загружает PointTable[], EmbeddingTable[], EdgeTable[] из IndexedDB

2. mediator.emit(POINTS_TABLE, pointsTable)
   └─► PointsTransformer.onPointsTable()
       ├─► convertPointsTableToModel() → PointModel[]
       ├─► pointsScene.setPoints(modelPoints)
       │   └─► PointsScene.entities._setPoints() ← КОПИЯ 1
       └─► mediator.pointsModelReady({points, edges})

3. mediator.emit(EMBEDDINGS_TABLE, embeddingsTable)
   └─► PointsTransformer.onEmbeddingsTable()
       ├─► mergeEmbeddingsIntoPoints(pointsScene.getPoints(), ...)
       └─► pointsScene.setPoints(points) ← Обновление КОПИИ 1
       └─► mediator.pointsModelReady({points, edges})

4. mediator.emit(POINTS_MODEL_READY, payload)
   └─► ModelManager.updatePoints(payload)
       └─► pointGraphManager.updatePoints(points)
           └─► pointGraphManager.pointCollection._setPoints() ← КОПИЯ 2
```

**Проблема:** На этом этапе уже существуют **две независимые копии** одних и тех же точек.

#### Поток 2: Улучшение графа (ModelManager.step)

```
1. mediator.emit(MODEL_MANAGER_STEP)
   └─► ModelManager.step()
       ├─► improve()
       │   ├─► pointGraphManager.getPoints() ← Читает КОПИЮ 2
       │   ├─► Вычисляет косинусные расстояния
       │   ├─► pointGraphManager.addEdge/removeEdge
       │   └─► Изменяет graph: NeighborGraph
       │
       └─► rebuildEdges()
           ├─► pointGraphManager.getAllEdgeRefs()
           ├─► edgeIndexesToEdgeModels(edgeRefs, pointGraphManager.pointCollection)
           └─► mediator.edges = edges ← Публикует рёбра

2. mediator.emit(EDGES, edges)
   └─► EdgesScene.onEdgeRefsUpd(edges)
       ├─► conv(edge) → EdgeModel
       │   └─► edgeIndexToEdgeModel(edge, pointsScene.Entities, ...) ← Использует КОПИЮ 1!
       └─► edgesScene.setEdges(...)
```

**Проблема:** EdgesScene использует `pointsScene.Entities` для конвертации EdgeRef → EdgeModel, но ModelManager работает с `pointGraphManager.pointCollection`. Если коллекции рассинхронизированы, рёбра будут ссылаться на неверные точки.

#### Поток 3: Физическая симуляция (AnimationEngine)

```
1. AnimationEngine.tick()
   ├─► GraphEngine.step() / RepulsionEngine.step() / ZDampingEngine.step()
   │   └─► Изменяют позиции точек: point.x, point.y
   │
   └─► mediator.pointsUpdating([])
       ├─► PointsScene: updateAllPointsPositions()
       │   └─► Обновляет DOM-элементы точек
       │
       └─► EdgesScene: updateLines()
           └─► Перерисовывает линии по новым координатам
```

**Проблема:** Физические движки работают с точками из одного источника (например, `pointsScene.getPoints()`), но ModelManager может иметь устаревшие позиции в `pointGraphManager.pointCollection`.

#### Поток 4: Сохранение позиций (PointsTransformer)

```
1. mediator.emit(POINTS_UPDATED, points) или POINT_UPDATED, point
   └─► PointsTransformer.savePoints(points)
       └─► dataManager.savePointsTable(pointTables)
           └─► IndexedDB: обновление PointTable

2. mediator.emit(SAVE_POSITIONS)
   └─► PointsTransformer.saveScene()
       ├─► savePoints(pointsScene.getPoints()) ← Сохраняет КОПИЮ 1
       └─► saveEdges(mediator.edges)
```

**Проблема:** При сохранении используются точки из PointsScene, а не из PointGraphManager. Если коллекции различаются, в БД сохранится不一致ное состояние.

---

## 3. Решение

### 3.1 Принцип единого источника истины (Single Source of Truth)

Необходимо ввести **единый центральный хранитель состояния точек**, к которому будут обращаться все компоненты системы.

### 3.2 Предлагаемая архитектура

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PointStateManager                                │
│  (Единый источник истины для всех PointModel)                           │
│                                                                         │
│  private pointCollection: EntityCollection<PointModel>                  │
│                                                                         │
│  Методы:                                                                │
│  - setPoints(points: PointModel[])                                      │
│  - getPoints(): PointModel[]                                            │
│  - getPointById(id: string): PointModel | undefined                     │
│  - updatePointPosition(id, x, y)                                        │
│  - subscribe(callback: (points) => void): () => void                    │
│  - notifyChange()                                                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ (внедрение зависимости)
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌──────────────┐          ┌──────────────────┐        ┌──────────────────┐
│ PointsScene  │          │ PointGraphManager│        │ PointsTransformer│
│              │          │                  │        │                  │
│ Получает:    │          │ Получает:        │        │ Получает:        │
│ - Точки для  │          │ - Точки для      │        │ - Точки для      │
│   рендеринга │          │   логики графа   │        │   сохранения     │
│ - Только чтение│        │ - Только чтение  │        │ - Только чтение  │
└──────────────┘          └──────────────────┘        └──────────────────┘
```

### 3.3 Варианты реализации

#### Вариант A: Внедрение PointStateManager как зависимости

**Шаги:**

1. Создать новый класс `PointStateManager`:
```typescript
export class PointStateManager {
  private pointCollection: EntityCollection<PointModel>;
  private listeners: Set<(points: PointModel[]) => void> = new Set();

  constructor() {
    this.pointCollection = new EntityCollection((p) => p.id);
  }

  public setPoints(points: PointModel[]): void {
    this.pointCollection.clear();
    this.pointCollection._setPoints(points, [], []);
    this.notifyChange();
  }

  public getPoints(): PointModel[] {
    return this.pointCollection.items;
  }

  public getPointById(id: string): PointModel | undefined {
    return this.pointCollection.getPointById(id);
  }

  public subscribe(callback: (points: PointModel[]) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyChange(): void {
    const points = this.getPoints();
    this.listeners.forEach(cb => cb(points));
  }
}
```

2. Модифицировать конструкторы зависимых классов:
```typescript
// PointsScene
constructor(
  private svgEngine: SvgEngine,
  private mediator: AppMediator,
  private pointState: PointStateManager, // ← Новая зависимость
  groupName = "points-scene",
) {
  // Больше не создаём this.entities
  // Используем pointState.getPoints() для рендеринга
}

// PointGraphManager
constructor(
  private pointState: PointStateManager, // ← Новая зависимость
) {
  // Удаляем this.pointCollection
  // Используем pointState.getPoints() для логики графа
}
```

3. В `index.ts` создать единый экземпляр:
```typescript
const pointState = new PointStateManager();

const pointsScene = new PointsScene(svgEngine, mediator, pointState);
const modelManager = new ModelManager(mediator, pointState);
const pointsTransformer = new PointsTransformer(mediator, dataManager, pointState);
```

**Преимущества:**
- ✅ Явные зависимости
- ✅ Единый источник истины
- ✅ Автоматическая синхронизация через подписку
- ✅ Легко тестировать (mock PointStateManager)

**Недостатки:**
- ⚠️ Требует рефакторинга множества файлов
- ⚠️ Нужно удалить дублирующиеся поля из классов

---

#### Вариант B: Использование AppMediator как централизованного хранилища

**Шаги:**

1. Добавить в `AppMediator` состояние точек:
```typescript
export class AppMediator extends BaseMediator {
  static POINTS_STATE = "points-state";
  
  public get points(): PointModel[] {
    return this.get(AppMediator.POINTS_STATE) ?? [];
  }
  public set points(value: PointModel[]) {
    this.set(AppMediator.POINTS_STATE, value);
    this.emit(AppMediator.POINTS_CHANGED, value);
  }
  
  public onPointsChanged(callback: (points: PointModel[]) => void): () => void {
    return this.on(AppMediator.POINTS_CHANGED, callback);
  }
}
```

2. Модифицировать классы для использования `mediator.points`:
```typescript
// PointsScene
constructor(private mediator: AppMediator, ...) {
  this.mediator.onPointsChanged((points) => {
    this.syncWithPoints(points);
  });
}

// PointGraphManager
constructor(private mediator: AppMediator) {
  this.mediator.onPointsChanged((points) => {
    this.syncGraphWithPoints(points);
  });
}
```

**Преимущества:**
- ✅ Не требует создания нового класса
- ✅ Уже есть инфраструктура (BaseMediator)
- ✅ Централизованное управление состоянием

**Недостатки:**
- ⚠️ Нарушает SRP медиатора (он становится ещё и хранилищем)
- ⚠️ Менее типобезопасно (mediator хранит any)
- ⚠️ Сложнее отслеживать зависимости

---

#### Вариант C: Делегирование хранения PointsScene (минимальный рефакторинг)

**Шаги:**

1. Сделать `PointsScene` единственным владельцем коллекции точек
2. `PointGraphManager` получает ссылки на точки из `PointsScene.Entities`

```typescript
// PointGraphManager
export class PointGraphManager {
  constructor(
    private pointsScene: PointsScene, // ← Внедряем PointsScene
  ) {}

  public updatePoints(points: PointModel[]): void {
    // Сначала обновляем PointsScene
    this.pointsScene.setPoints(points);
    
    // Затем синхронизируем граф
    const pointCollection = this.pointsScene.Entities;
    // ... логика графа использует pointCollection
  }

  public getPoints(): PointModel[] {
    return this.pointsScene.getPoints();
  }
}
```

**Преимущества:**
- ✅ Минимальные изменения кода
- ✅ Быстрая реализация
- ✅ PointsScene естественно владеет визуальным состоянием

**Недостатки:**
- ⚠️ Создаёт циклическую зависимость (EdgesScene уже зависит от PointsScene)
- ⚠️ PointsScene становится слишком ответственным (view + model)
- ⚠️ Не решает проблему полностью,只是 перемещает её

---

### 3.4 Рекомендуемое решение

**Вариант A (PointStateManager)** является наиболее правильным с архитектурной точки зрения:

1. **Разделение ответственности:**
   - `PointStateManager` — хранение и управление состоянием (Model)
   - `PointsScene` — визуализация (View)
   - `PointGraphManager` — бизнес-логика графа (Controller/Logic)

2. **Следование принципам SOLID:**
   - Single Responsibility: каждый класс отвечает за свою задачу
   - Dependency Inversion: зависимости внедряются через конструктор

3. **Масштабируемость:**
   - Легко добавить новые компоненты, работающие с точками
   - Простое тестирование через mock PointStateManager
   - Возможность добавить кэширование, валидацию, историю изменений

### 3.5 План миграции

1. **Фаза 1: Подготовка**
   - Создать `PointStateManager`
   - Добавить unit-тесты для него

2. **Фаза 2: Параллельное существование**
   - Внедрить `PointStateManager` в один компонент (например, `PointsTransformer`)
   - Оставить старые поля в других классах
   - Проверить корректность работы

3. **Фаза 3: Постепенная миграция**
   - Переключить `ModelManager` на использование `PointStateManager`
   - Переключить `PointsScene` на использование `PointStateManager`
   - Переключить `PointGraphManager` на использование `PointStateManager`

4. **Фаза 4: Очистка**
   - Удалить дублирующиеся поля `entities`, `pointCollection`
   - Удалить временный код совместимости
   - Обновить документацию

---

## Заключение

Конфликт между `PointsScene` и `PointGraphManager` является классическим примером нарушения принципа единственного источника истины. Решение через введение `PointStateManager` обеспечит:

- ✅ Консистентность данных во всей системе
- ✅ Упрощение архитектуры
- ✅ Снижение риска багов при синхронизации
- ✅ Улучшение тестируемости кода
- ✅ Соответствие принципам чистой архитектуры
