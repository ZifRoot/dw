# 1. Поток данных

Сейчас в клиенте фактически существуют **три разных представления одних и тех же данных**:

* `Table` — данные хранения;
* `Model` — рабочие объекты графа;
* `UI model` / состояние Mediator — данные интерфейса и события.

Ключевые сущности:

```text
DB ( PointTable, EmbeddingTable, EdgeTable, ...)
      │
      │ DataManager  <- (Server dew)
      ▼
PointsTransformer (Table → Model , Table <- Model)
      ^
      │ 
      │
      ▼
PointGraphManager
      │
      ├──────────--------------------------─────┐
      │                                         │
      ▼                                         ▼ 
Scenes( PointsScene, EdgesScene, ...)       physics(GraphEngine, RepulsionEngine, ZDampingEngine) 
      │                                         │
      └───────┬─────--------------------------──┘
              │
              ▼
        SVG / D3 / UI
```

При этом есть ещё `AppMediator`, который пронизывает практически весь client.

---

## 2. `DataManager` его задача инкапсулировать работу с Tables получение, сохранение и мержинг Tables из DB и Server dew
загружает из DB синхронизирует с Server dew:

и передаёт их в `PointsTransformer`:

Загрузка данных происходит через DataManager.reloadTables() из события медиатора

```text
DataManager
    │
    ├── PointTable[]
    ├── EmbeddingTable[]
    └── EdgeTable[]
    │
    ▼
PointsTransformer.setTables()
```

Это уже неплохое разделение: `DataManager` знает про хранение, а `PointsTransformer` занимается преобразованием `Table → Model`.

---

# 3. `PointsTransformer` делает преобразования Table → Model Table <- Model
 

### Точки

```text
PointTable[]
    ^
    ▼
PointModel[]
```

### Embeddings

```text
EmbeddingTable[]
    │
    ▼
PointModel.embeddings
```

То есть embedding физически становится частью `PointModel`.

### Рёбра

А вот здесь появляется важная особенность:

```text
EdgeTable[]
    │
    ▼
EdgeRef[]
```


---

# 4. PointGraphManager  – инкапсулирует управление коллекцией точек и графом связей.  Гарантирует консистентность: при изменении точек автоматически очищает "висячие" рёбра.

После преобразования:

```text
PointsTransformer
       │
       ▼
PointGraphManager.update(points, edges)
```

`PointGraphManager` хранит:

```text
PointGraphManager
│
├── pointCollection :EntityCollection
│      └── PointModel[]
│
└── graph
       └── NeighborGraph
              │
              ├── edgeCollection :EntityCollection
              │      └── EdgeModel[]
              │
              └── adjacency
                     └── pointId → edgeIds
```

`NeighborGraph` — единое хранилище графа связей.

## Концепция

Граф хранится как ДВА синхронизированных представления одного набора рёбер:

1. **Плоский список рёбер** — `edgeCollection: EntityCollection<EdgeModel>`.
   Единственный источник правды. Каждое ребро лежит здесь ровно один раз,
   независимо от количества инцидентных точек.

2. **Индекс смежности** — `adjacency: Map<pointId, Set<edgeId>>`.
   Для каждой точки — множество id инцидентных рёбер.
   ВАЖНО: adjacency хранит именно **id**, а не индексы в массиве.
   Это ключевое решение: EntityCollection удаляет через swap-with-last,
   то есть `items` переупорядочивается. Если бы adjacency хранил индексы,
   его пришлось бы переиндексировать при каждом удалении. Id-ссылки
   от переупорядочивания не страдают — adjacency остаётся валидным.

Ключевая идея: ребро одно, а точек у него две. Регистрируем ребро
в adjacency под обоими концами — граф становится неориентированным
по хранению, при том что модель ребра помнит направление.

## Инвариант

В любой момент после любой публичной операции:
- каждое ребро из `edgeCollection` присутствует в `adjacency[sourceId]`
  и в `adjacency[targetId]` под своим id;
- в `adjacency` нет id, которых нет в `edgeCollection`;
- каждая точка в adjacency реально является концом указанного ребра.

`EntityCollection<T>` — коллекция сущностей с гарантированно актуальным
индексом `id → позиция в массиве`.

## Концепция

Главная задача коллекции — чтобы `indexMap` в любой момент времени
точно соответствовал `items`. Не «в основном», не «после ребилда»,
а всегда. Именно на это заточены все операции.

## Две ключевые идеи

1. **Стабильная ссылка на массив.**
   `items` не пересоздаётся — он мутируется на месте. Ссылка на массив
   остаётся одной и той же на протяжении жизни коллекции.
   Это позволяет:
   - отдавать `items` наружу без риска, что она «протухнет»;
   - держать внешние ссылки/наблюдатели, которые всегда видят актуальный срез;
   - использовать коллекцию как стабильный источник данных (например,
     для привязок, кэшей, мемоизации по ссылке).

2. **Удаление через swap-with-last, а не через shift.**
   При удалении элемента на его место встаёт последний элемент массива,
   длина уменьшается на 1. Это даёт:
   - переиндексацию ровно ОДНОГО элемента (переехавшего последнего),
     а не всех справа, как при `splice`;
   - O(1) на удаление вместо O(n);
   - сохранение стабильной ссылки на массив.

   Плата — порядок элементов НЕ сохраняется. Это осознанный размен:
   актуальность `indexMap` и стабильность ссылки важнее порядка.

## Инвариант

В любой момент после любой публичной операции:
  - `items.length === indexMap.size`;
  - для каждого `[id, idx]` из `indexMap`: `getId(items[idx]) === id`;
  - для каждого `i`: `indexMap.get(getId(items[i])) === i`.

Проверяется методом `validate()`.

---

# 5. Кто использует PointGraphManager

После создания в `index.ts`:

```ts
const pointGraphManager = new PointGraphManager(mediator);
```

один и тот же экземпляр получают:

```text
                 PointGraphManager
                  /      |       \
                 /       |        \
                ▼        ▼         ▼
         PointsScene  EdgesScene  ModelManager
```

Это уже движение в правильную сторону.

`index.ts` действительно создаёт один PGM и передаёт его всем трём компонентам.

---

# 6. PointsScene

`PointsScene` получает:

```text
PointGraphManager
       │
       ▼
getPointsArray()
       │
       ▼
PointModel[]
       │
       ▼
D3
       │
       ▼
SVG
```

Причём:

```ts
this.points = this.pointGraphManager.getPointsArray();
```

То есть `PointsScene` хранит **ссылку на тот же массив**, а не отдельную копию.

Это означает:

```text
PointGraphManager.pointCollection.items
             ▲
             │
             │ same array
             │
       PointsScene.points
```

Это принципиально.

---

# 7. EdgesScene

Аналогично:

```text
PointGraphManager
       │
       ▼
NeighborGraph
       │
       ▼
EdgeModel[]
       │
       ▼
EdgesScene.edges
       │
       ▼
D3 SVG lines
```

`EdgesScene` получает живой массив через:

```ts
this.pointGraphManager.getEdgesArray();
```

и использует непосредственно `EdgeModel.source` / `EdgeModel.target` для координат.

То есть:

```text
EdgeModel
 ├── source ──→ PointModel
 └── target ──→ PointModel

       │
       ▼
     SVG line
```

---

# 8. ModelManager

`ModelManager` - заниматься созданием и улучшением графа.

## У `ModelManager` есть правило у каждой точки должно быть не более K связей, но и желательно чтобы не меньше K.

~~v1:Находит лучшую модель , - та для которой посчитаны больше точек~~
**v2:Делает сортированный список моделей по количеству точек**

Далее **по сигналу** от медиатора занимается улучшением графа, используя PointGraphManager.
    Для каждой точки ище кандидатом из [соседи (max K), соседи соседей ( (max K1)*(max K2) ),  случайные (max K3)] уникальных , сортирует **критерию сортировки** выбирает K


K=K1=K2=K3 - пока равны , но в дальнейшем может tine

**критерий сортировки** - сейчас это cosine distance.
Но ранее рассматривался вариант количество общих ярких фич это можно увидеть здесь [ EmbeddingModel.activeIndices, EmbeddingModelюintersectionCount ] , он этой идеи решино было отказаться.


```text
Point
  │
  ├── текущие соседи
  ├── соседи соседей
  └── random candidates
          │
          ▼
   cosine distance
          │
          ▼
        top-K
          │
          ▼
   addEdge/removeEdge
```

То есть изменения графа он уже делает правильно через:

```text
PointGraphManager.addEdge()
PointGraphManager.removeEdge()
```

а не напрямую через `NeighborGraph`.

Это хорошо.

---


# 10. Физика

Есть несколько физических движков
1. RepulsionEngine - репульсия , рассталкивает точки, чтобы точки не слипались.
2. GraphEngine - стягивает точки со связями
3. ZDampingEngine - стягивает точки в плоскость, это сделано вот почему: 
    если точки будут двигатся только в одной плоскости им сложнее будет двигатся к своим связям, поэтому было принято увеличить количество осей до 3 (возможно и больше ) но затем для стабилизации нужно стягивать к основным осям.
    
    возможно развитие проекта с D3js к three.js и 3d пространству , при этом конципция ZDampingEngine будет продолжена , осей будет не 3 а более .  (продолжение класса ZDampingEngine ) будет стягивать к 3-м осям

Движки выполняются последовательно у указаном порядке в одном шаге анимации.

Физика выполняется до порого "температуры".

~~V1:Изменения в позициях точек "Физика" информирует систему через медиантор ~~
~~V2:Физических движков несколько чтобы не дублирова сообщениями за информирование отвечает `AnimationEngine`~~
**V3:Изменения в позициях точек информировать систему через медиантор будет `EnginePipeline`**
 
**есть проблема**
физические движки используют `AnimationEngine` напрямую , нужно создать `EnginePipeline` для их организации.

---

# 11. AnimationEngine

`AnimationEngine` - выполняет асинхронные операции через requestAnimationFrame
Это единсвенный класс которому позволено запускать requestAnimationFrame , все классы которым нужно запустить requestAnimationFrame должны использовать `AnimationEngine`

задача `AnimationCallback` будет следить чтобы выполнение задач не превосходило времени на кадр

---

# 12. AppMediator

Mediator сейчас одновременно используется как "Сигнальная шина" 
Может отправлеть сигналы и имеет хранилище информирует если содержимое поменялось
и этому потому удеально подходит для "UI state"
в нем не желательно хранить большие обекты , что уже исправлено.


### Сигнальная шина

Например:

```text
POINTS_UPDATING
POINTS_UPDATED
POINTS_GRAPH_UPDATED
START_REPULSION
...
```

### UI state:

```text
temperature
targetSize
autoZoom
selectedPoint
selectedEdge
sizeText
progress
```

`AppMediator` фактически стал смесью:

```text
Event Bus
    +
UI State
    +
Command Bus
```

---

# 13. Сохранение

Когда нужно сохранить позиции:

```text
UI
 │
 ▼
Mediator.savePositions()
 │
 ▼
PointsTransformer
 │
 ├── PointGraphManager.getPoints()
 │
 └── PointGraphManager.getAllEdgeRefs()
          │
          ▼
      Table[]
          │
          ▼
      DataManager
          │
          ▼
      IndexedDB
```

То есть здесь происходит уже нормальное преобразование:

```text
Model → Table
```

А `DataManager` снова занимается исключительно persistence.

---

# 14. Сводная схема текущего `dev`

Я бы сейчас зафиксировал её именно так:

```text
                         SERVER
                           │
                           ▼
                    ┌─────────────┐
                    │ DataManager │
                    └──────┬──────┘
                           │
                      Table entities
                           │
                           ▼
                  ┌──────────────────┐
                  │ PointsTransformer│
                  └────────┬─────────┘
                           │
                 Table → Model
                           │
             ┌─────────────┴─────────────┐
             │                           │
             ▼                           ▼
        PointModel[]                  EdgeRef[]
             │                           │
             │                           ▼
             │                    ┌──────────────┐
             │                    │ NeighborGraph│
             │                    │              │
             │                    │ EdgeModel[]  │
             │                    │ adjacency    │
             │                    └──────┬───────┘
             │                           │
             └──────────┬────────────────┘
                        ▼
                PointGraphManager
                        │
          ┌─────────────┼──────────────┐
          │             │              │
          ▼             ▼              ▼
     PointsScene   EdgesScene    ModelManager
          │             │              │
          ▼             ▼              │
         SVG           SVG             │
                                        │
                              add/remove EdgeModel
                                        │
                                        ▼
                                  PointGraphManager


                 PointGraphManager
                        │
             ┌──────────┴──────────┐
             ▼                     ▼
       PointModel[]            EdgeModel[]
             │                     │
             ▼                     ▼
      RepulsionEngine          GraphEngine
      ZDampingEngine                 │
             │                       │
             └───────────┬───────────┘
                         ▼
                    PointModel
                         │
                         ▼
                 AnimationEngine
                         │
                         ▼
                    AppMediator
                         │
                 pointsUpdating
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
        PointsScene             EdgesScene
```

---

# Проблемные точки

Теперь самое главное. Я бы **не начинал пока ничего исправлять**. Сначала фиксируем проблемы.

## 🔴 P1. путаница с сущностями `EdgeModel` `EdgeModel`

Самая очевидная архитектурная проблема:

```text
EdgeModel
   ↓
EdgeRef
   ↓
EdgeModel
```

в `ModelManager.rebuildEdges()`.

Причём исходный `EdgeModel` уже существует внутри `NeighborGraph`.

Это создаёт второе представление одного и того же графа.

---

## 🔴 P4. `PointGraphManager` знает слишком много о преобразовании `EdgeRef → EdgeModel`

Метод:

```ts
edgeIndexToEdgeModel()
```

содержит довольно существенную бизнес-логику:

* поиск точек;
* нормализация source/target;
* поиск общей embedding model;
* подсчёт intersection;
* выбор лучшей модели;
* создание `EdgeModel`.

Это уже не просто «manager коллекции».

Но пока **нельзя автоматически выносить это куда-либо** — сначала нужно понять, действительно ли эта логика принадлежит PGM или `NeighborGraph`/factory.

### Решение
в `NeighborGraph` уже есть `factory: IEdgeModelFactory` нужно этот фактори пробросить еще выше , получается на `ModelManager`.

т.е. архитектура будет такой:
1. `ModelManager` описывает преобразование `EdgeRef → EdgeModel`.
2. `ModelManager` создает `PointGraphManager` и передает `factory: IEdgeModelFactory` в `PointGraphManager` .
2.1. `PointGraphManager` и в свою очередь передает `factory: IEdgeModelFactory` в `NeighborGraph`

---


# 🟠 P10. `EdgeRef` — странный промежуточный слой (признаю , пока нет идей)

Сейчас:

```ts
EdgeRef {
    sourceId
    targetId
    modelName?
    distance?
}
```

Он используется:

```text
EdgeTable → EdgeRef → EdgeModel
```

и:

```text
EdgeModel → EdgeRef → EdgeTable
```

Но одновременно `EdgeModel implements EdgeRef`.

То есть концептуально:

```text
EdgeModel IS-A EdgeRef
```

при этом есть отдельный:

```text
EdgeRef
```

Это надо отдельно разобрать.

---


# P12. Есть дублирование состояния UI ↔ Model (Да)

Например selection:

```text
PointModel.selected
       +
mediator.selectedPoint
```

То есть состояние выбора потенциально находится в двух местах.

Аналогично:

```text
PointModel.x/y
       +
SVG transform
```

Это нормальная часть MVC-подобной системы, но здесь нет чётко формализованного ownership.

---

# P14. Физика и `PointsScene`  напрямую меняет `PointModel` (Да)

Здесь

```text
Physics → Model
Scene → Model
```

Важно то что Physics и Scene может может менять объект , но не могу менять их количество напрямую только через PointGraphManager, и нужно информировать систему о обновлении через медиатор


Здесь
```text

ModelManager → PointGraphManager-> Graph
```

изменять количество `PointModel` может только `PointGraphManager`

---

# 18. Что я считаю главным сейчас

Если выстроить проблемы по архитектурному приоритету, я бы пока зафиксировал **не рейтинг, а порядок исследования**:

```text
1. Кто владеет PointModel?  количеством только `PointGraphManager`, поля обекта любой но желательно извести через медиатор
2. Кто владеет EdgeModel?  количеством только `PointGraphManager` и 
3. Где является единственным состоянием граф? `NeighborGraph`
4. Зачем существует EdgeRef? Хороший вопрос, пытаюсь сформулировать
6. Как обновляются PointModel и EdgeModel без висячих ссылок?
7. Какие данные должны идти через Mediator? События и UI
8. Какие данные должны идти прямой ссылкой? желательно ни какие , за счёт EntityCollection данные менялись in-place а события через Mediator
9. Где проходит граница Table → Model?  PointsTransformer
10. Где проходит граница Model → View? Mediator
```

И только после этого менять код.

---



