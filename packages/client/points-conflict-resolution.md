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

## 3. Итог по вариантам решения

### 3.1 Вариант A — PointStateManager
- **Не подходит.**
- **Причина:** создаёт ещё одного хранителя точек.
- **Вывод:** плохо.

### 3.2 Вариант B — медиатор как централизованное хранилище
- **Не подходит.**
- **Причина:** медиатор не должен быть хранителем информации.
- **Допустимо:** в редких случаях медиатор может выступать кэшем.
- **Недопустимо:** использовать медиатор как хранитель информации.
- **Вывод:** плохо.

### 3.3 Вариант C — внедрение PointsScene в PointGraphManager
- **Не подходит.**
- **Суть:** `PointsScene` внедряется в `PointGraphManager` как зависимость.
- **Проблема:** в модели оказывается view-элемент.
- **Вывод:** очень плохо. Самый смешной вариант.

---

## 4. Дополнительная проблема: EdgesScene

- В конфликте также замешана `EdgesScene` — сцена связей (граней, edges).
- `EdgesScene` уже зависит от `PointsScene.Entities` для конвертации `EdgeRef → EdgeModel`.
- Таким образом, конфликтующие сущности: `PointGraphManager`, `PointsScene`, `EdgesScene`.

---

## 5. Предложение: разворот направления зависимости

Развернуть направление зависимости.

- В сценовые элементы — а именно в `PointsScene` и в `EdgesScene` — вставить **ссылку на `PointGraphManager`**.
- **Обоснование:** во view может находиться модель. Зависимость `view → model` допустима.
- **Почему это лучше варианта C:** вариант C создаёт `model → view` (модель знает о view), что недопустимо. Предложение делает наоборот — view знает о модели, что нормально.
- **Побочный эффект:** `PointGraphManager` становится единственным хранителем точек, а `PointsScene` и `EdgesScene` перестают дублировать состояние.

---

## 6. Сводка по вариантам

| Вариант | Оценка | Причина |
|---|---|---|
| A — PointStateManager | ❌ | Ещё один хранитель точек |
| B — медиатор как хранилище | ❌ | Медиатор не должен быть хранителем |
| C — PointsScene внутри PointGraphManager | ❌ | В модели оказывается view |
| **Предложение — view → PointGraphManager** | ✅ | View может содержать модель; PGM — единственный хранитель |

---

## 7. Что нужно сделать

### 7.1 Общий принцип

`PointGraphManager` становится **единственным хранителем** коллекций точек и граней (`EntityCollection`). Обе сцены (`PointsScene`, `EdgesScene`) получают **ссылку на сам менеджер** и держат **прямые ссылки на его живые массивы** через кэш-поля.

Никакого копирования и синхронизации: сцена видит тот же массив, что и менеджер, потому что это один и тот же объект.

---

### 7.2 PointGraphManager — что сделать

**Ничего не удалять.** Он уже владеет обеими коллекциями:

**Что добавить / убедиться:**

1. ✅ Есть публичные геттеры для живых массивов:
   ```typescript
   public getPointsArray(): PointModel[] {
     //  именно ссылка, не копия
   }

   public getEdgesArray(): EdgeModel[] {
      //  именно ссылка, не копия
   }
   ```

2. ✅ Обновления коллекций в PointGraphManager происходят **мутацией на месте** (in-place), а не через пересоздание массива. Иначе ссылки в сценах «оторвутся» от живого массива (! ЭТО УЖЕ РЕЛИЗОВАНО в PointGraphManager !)
   ```typescript
   // ✅ ПРАВИЛЬНО: мутируем существующий массив
   this.anyCollection.items.length = 0;
   this.anyCollection.items.push(...newPoints);

   // ❌ НЕПРАВИЛЬНО: пересоздаём массив
   this.anyCollection.items = [...newPoints];
   ```

3. ✅ Если какой-то метод сейчас возвращает `getPoints()` через spread или `.slice()` — заменить на возврат ссылки (или завести отдельный метод для ссылки).

---

### 7.3 PointsScene — что удалить и что добавить

#### ❌ Удалить

1. Поле `entities: EntityCollection<PointModel>` — **удалить полностью**.
   - Это был дублирующий хранитель.
   - Больше не нужен: единственный хранитель — `PointGraphManager`.

2. Методы, которые работали поверх `this.entities` — **удалить или делегировать в `PointGraphManager`**:
   - `setPoints()` → делегировать в PGM
   - `getPointById()` → делегировать в PGM
   - `updatePointPosition()` → делегировать в PGM
   - `removePoints()` → делегировать в PGM

3. Все места в коде сцены, где было обращение `this.entities.…` — заменить на `this.pointGraphManager.…` или на `this.points`.

#### ✅ Добавить

1. Ссылку на сам хранитель:
   ```typescript
   private pointGraphManager: PointGraphManager;
   ```
   Прокидывается через конструктор:
   ```typescript
   constructor(
     private svgEngine: SvgEngine,
     private mediator: AppMediator,
     private pointGraphManager: PointGraphManager, // ← новая зависимость
     groupName = "points-scene",
   ) { … }
   ```

2. **Ссылку на массив точек** (та самая «кэш-ссылка» для быстрого доступа):
   ```typescript
   private points: PointModel[] = []; // ← НЕ копия, а ссылка на живой массив
   ```


3. **Синхронизацию ссылок** при инициализации и при обновлении данных:
   ```typescript
   private syncRefs(): void {
     this.points = this.pointGraphManager.getPointsArray();
     this.edges  = this.pointGraphManager.getEdgesArray();
   }
   ```
   Вызывается:
   - в конструкторе,
   - при любом событии, после которого массивы в PGM могли пересоздаться (если такое случится) (райне редко).

#### ✅ Оставить / переиспользовать

- Поле `points: PointModel[]` **оставить как кэш**, но завязать на `PointGraphManager` (см. п. 2 выше).
- Всю логику рендеринга — не трогать, только источник данных поменять.

---

### 7.4 EdgesScene — что удалить и что добавить

Схема **точно такая же**, как в `PointsScene`.

#### ❌ Удалить

1. Поле `entities: EntityCollection<EdgeModel>` — **удалить полностью**.
   - Это был дублирующий хранитель граней.
   - Единственный хранитель — `PointGraphManager`.

2. Все места в коде сцены, где было обращение `this.entities.…` — заменить на `this.pointGraphManager.…` или на `this.edges`.

3. Обращения к `pointsScene.Entities` (если остались) — заменить на `this.pointGraphManager.getPointsArray()`.

#### ✅ Добавить

1. Ссылку на сам хранитель:
   ```typescript
   private pointGraphManager: PointGraphManager;
   ```

2. **Ссылку на массив граней** (кэш-ссылка):
   ```typescript
   private edges: EdgeModel[] = []; // ← НЕ копия, а ссылка на живой массив
   ```

3. **Ссылку на массив точек** (сцена держит обе коллекции — и грани, и точки):
   ```typescript
   private points: PointModel[] = []; // ← НЕ копия, а ссылка на живой массив
   ```

4. **Синхронизацию ссылок** — аналогично `PointsScene`:
   ```typescript
   private syncRefs(): void {
     this.edges  = this.pointGraphManager.getEdgesArray();
     this.points = this.pointGraphManager.getPointsArray();
   }
   ```

#### ✅ Оставить / переиспользовать

- Массив граней, который раньше был кэшем, **оставить**, но завязать на `PointGraphManager`.

---

### 7.5 index.ts — что добавить

1. `PointGraphManager` создаётся **до** сцен и передаётся в обе:
   ```typescript
   const pointGraphManager = new PointGraphManager(mediator);

   const pointsScene = new PointsScene(svgEngine, mediator, pointGraphManager);
   const edgesScene  = new EdgesScene(svgEngine, mediator, pointGraphManager);
   ```

2. Убедиться, что `ModelManager` тоже получает **тот же самый** экземпляр `PointGraphManager` (а не создаёт свой). Это критично: иначе снова появятся два хранителя.

---

### 7.6 Порядок работ

1. **PointGraphManager:** добавить геттеры, проверить in-place мутацию.
2. **index.ts:** создать единый PGM, прокинуть в сцены и в `ModelManager`.
3. **PointsScene:** удалить `entities`, добавить `pointGraphManager` + ссылки-кэши (`points`, `edges`), делегировать методы в PGM.
4. **EdgesScene:** то же самое (удалить `entities`, добавить PGM + ссылки-кэши).
5. **Проверка:** убедиться, что нигде не осталось `pointsScene.entities` / `edgesScene.entities` и что все массивы — живые ссылки.
6. **Очистка:** удалить временный код совместимости, обновить документацию и схему потоков данных.

---

## 8. Заключение

Конфликт между `PointsScene` и `PointGraphManager` является классическим примером нарушения принципа единственного источника истины. Решение через внедрение ссылки на `PointGraphManager` в сцены (`view → model`) обеспечит:

- ✅ Консистентность данных во всей системе
- ✅ Упрощение архитектуры
- ✅ Снижение риска багов при синхронизации
- ✅ Следование принципам SOLID (Single Responsibility, Dependency Inversion)
- ✅ Масштабируемость: легко добавить новые компоненты, работающие с точками
- ✅ Улучшение тестируемости кода
- ✅ Соответствие принципам чистой архитектуры
