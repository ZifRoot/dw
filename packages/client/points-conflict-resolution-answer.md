## 3.4 Итог по вариантам решения

### Вариант A — PointStateManager
- **Не подходит.**
- **Причина:** создаёт ещё одного хранителя точек.
- **Вывод:** плохо.

### Вариант B — медиатор как централизованное хранилище
- **Не подходит.**
- **Причина:** медиатор не должен быть хранителем информации.
- **Допустимо:** в редких случаях медиатор может выступать кэшем.
- **Недопустимо:** использовать медиатор как хранитель информации.
- **Вывод:** плохо.

### Вариант C — внедрение PointsScene в PointGraphManager
- **Не подходит.**
- **Суть:** `PointsScene` внедряется в `PointGraphManager` как зависимость.
- **Проблема:** в модели оказывается view-элемент.
- **Вывод:** очень плохо. Самый смешной вариант.

---

## 3.5 Дополнительная проблема: EdgesScene

- В конфликте также замешана `EdgesScene` — сцена связей (граней, edges).
- `EdgesScene` уже зависит от `PointsScene.Entities` для конвертации `EdgeRef → EdgeModel`.
- Таким образом, конфликтующие сущности: `PointGraphManager`, `PointsScene`, `EdgesScene`.

---

## 3.6 Предложение

Развернуть направление зависимости.

- В сценовые элементы — а именно в `PointsScene` и в `EdgesScene` — вставить **ссылку на `PointGraphManager`**.
- **Обоснование:** во view может находиться модель. Зависимость `view → model` допустима.
- **Почему это лучше варианта C:** вариант C создаёт `model → view` (модель знает о view), что недопустимо. Предложение делает наоборот — view знает о модели, что нормально.
- **Побочный эффект:** `PointGraphManager` становится единственным хранителем точек, а `PointsScene` и `EdgesScene` перестают дублировать состояние.

---

## 3.7 Сводка

| Вариант | Оценка | Причина |
|---|---|---|
| A — PointStateManager | ❌ | Ещё один хранитель точек |
| B — медиатор как хранилище | ❌ | Медиатор не должен быть хранителем |
| C — PointsScene внутри PointGraphManager | ❌ | В модели оказывается view |
| **Предложение — view → PointGraphManager** | ✅ | View может содержать модель; PGM — единственный хранитель |

---

Понял, закрыли тему вариантов. Теперь — только **раздел «Что делать»**, подробно. С учётом того, что:

- каждая сцена держит ссылку на **`PointGraphManager`** (сам хранитель),
- и внутри PGM — **обе коллекции** (`pointCollection` и `edgeCollection`),
- сцена хранит **ссылки на обе** (и на точки, и на грани),
- плюс кэш-поля для быстрого доступа.

Вот финализированный раздел:

---

## Что нужно сделать

### Общий принцип

`PointGraphManager` становится **единственным хранителем** коллекций точек и граней (`EntityCollection`). Обе сцены (`PointsScene`, `EdgesScene`) получают **ссылку на сам менеджер** и держат **прямые ссылки на его живые массивы** через кэш-поля.

Никакого копирования и синхронизации: сцена видит тот же массив, что и менеджер, потому что это один и тот же объект.

---

### 1. PointGraphManager — что сделать

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

### 2. PointsScene — что удалить и что добавить

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

### 3. EdgesScene — что удалить и что добавить

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

### 4. index.ts — что добавить

1. `PointGraphManager` создаётся **до** сцен и передаётся в обе:
   ```typescript
   const pointGraphManager = new PointGraphManager(mediator);

   const pointsScene = new PointsScene(svgEngine, mediator, pointGraphManager);
   const edgesScene  = new EdgesScene(svgEngine, mediator, pointGraphManager);
   ```

2. Убедиться, что `ModelManager` тоже получает **тот же самый** экземпляр `PointGraphManager` (а не создаёт свой). Это критично: иначе снова появятся два хранителя.


### 6. Порядок работ

1. **PointGraphManager:** добавить геттеры, проверить in-place мутацию.
2. **index.ts:** создать единый PGM, прокинуть в сцены и в `ModelManager`.
3. **PointsScene:** удалить `entities`, добавить `pointGraphManager` + ссылки-кэши (`points`, `edges`), делегировать методы в PGM.
4. **EdgesScene:** то же самое (удалить `entities`, добавить PGM + ссылки-кэши).
5. **Проверка:** убедиться, что нигде не осталось `pointsScene.entities` / `edgesScene.entities` и что все массивы — живые ссылки.
6. **Очистка:** удалить временный код совместимости, обновить документацию и схему потоков данных.

---
