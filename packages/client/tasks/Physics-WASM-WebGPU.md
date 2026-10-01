# Задача: Physics — WASM и WebGPU backend

## Цель

Зафиксировать архитектуру для реализации текущей browser physics в двух backend-вариантах:

- WebAssembly;
- WebGPU compute shaders (WGSL).

Обе реализации должны сохранять одну математическую семантику и один порядок physics:

1. Repulsion;
2. Graph physics;
3. Z-damping.

Это исследовательская задача: WASM и WebGPU реализуются оба, чтобы сравнивать вычисления, синхронизацию и итоговую производительность.

---

## 1. Текущее состояние

Источник истины для набора точек:

```text
PointGraphManager
    ↓
EntityCollection<Point>
    ↓
Point[]
```

`Point[]` имеет стабильную ссылку и изменяется in-place. Текущие physics работают непосредственно с JavaScript-моделью точек.

Рендеринг остаётся JavaScript/D3/SVG, поэтому после physics актуальные координаты должны возвращаться в существующие `Point`.

---

## 2. Хранители памяти и единый логический state

Архитектура вводит три сущности, которые владеют состоянием соответствующего уровня:

- `PointGraphManager` — хранитель domain state и источник истины для `Point`/`Edge`;
- `WasmPhysicsMemory` — хранитель physics state в WASM linear memory;
- `WebGpuPhysicsMemory` — хранитель physics state в WebGPU `GPUBuffer`.

WASM и WebGPU holders получают `PointGraphManager` в конструкторе. Они не получают копию массива точек и не становятся вторым domain source of truth.

Концептуально:

```text
                    PointGraphManager
                  domain source of truth
                         │
             ┌───────────┴───────────┐
             │                       │
             ▼                       ▼
   WasmPhysicsMemory         WebGpuPhysicsMemory
      PointGraphManager          PointGraphManager
      + WASM state               + GPU state
             │                       │
       WASM physics              WebGPU physics
```

Каждый holder:

1. хранит ссылку на `PointGraphManager`;
2. владеет своим backend-compatible physics state;
3. подписывается на необходимые события `AppMediator`;
4. при необходимости самостоятельно читает актуальные данные из `PointGraphManager`;
5. при необходимости самостоятельно записывает результат обратно в существующие `Point` через `PointGraphManager`;
6. не зависит от второго backend holder.

Таким образом, WASM и WebGPU являются **независимыми хранителями состояния и независимыми execution cores**, работающими с одним domain source of truth.

---

## 3. Один логический state, два физических storage

Логически существует одно состояние physics, но у backend разные физические области памяти:

```text
                         PointGraphManager
                                │
                         logical domain state
                                │
                  ┌─────────────┴─────────────┐
                  │                           │
                  ▼                           ▼
        WasmPhysicsMemory             WebGpuPhysicsMemory
                  │                           │
          WASM linear memory             GPUBuffer
                  │                           │
        ┌─────────┴─────────┐       ┌─────────┴─────────┐
        │        │          │       │        │          │
   Repulsion   Graph   Z-damping  Repulsion  Graph   Z-damping
        │        │          │       │        │          │
        └────────┴──────────┘       └────────┴──────────┘
                  │                           │
                  └─────────────┬─────────────┘
                                ▼
                         PointGraphManager
                                │
                              Point[]
                                │
                              D3/SVG
```

WASM `WebAssembly.Memory` и WebGPU `GPUBuffer` не следует считать одним физическим объектом памяти. Обычный browser WebGPU API не даёт архитектуры, на которую можно надёжно опереться для прямого aliasing этих областей.

Поэтому backend имеют два физических storage, но используют единый логический physics contract.

---

## 4. Holder является не только памятью

Название «хранитель памяти» не означает пассивный контейнер.

Каждый backend holder является одновременно:

- владельцем backend physics state;
- адаптером между `PointGraphManager` и backend;
- подписчиком на необходимые mediator events;
- координатором загрузки/выгрузки состояния;
- execution core соответствующего backend;
- владельцем набора реализаций physics algorithms;
- владельцем backend-specific механизма запуска вычислений.

То есть `WasmPhysicsMemory` и `WebGpuPhysicsMemory` концептуально ближе к **Physics Backend Engine**, чем к простому массиву/буферу.

При этом они не заменяют `PointGraphManager`: domain state остаётся в `PointGraphManager`.

---

## 5. Physics algorithms: 3 × 2 реализации

Для каждого backend существуют три physics algorithm implementations:

```text
                    Physics
                       │
          ┌────────────┴────────────┐
          │                         │
        WASM                      WebGPU
          │                         │
    ┌─────┼─────┐             ┌─────┼─────┐
    │     │     │             │     │     │
Repulsion Graph Z-damping   Repulsion Graph Z-damping
```

Итого:

- 3 логических physics algorithms;
- 2 backend-specific реализации;
- 6 concrete algorithm implementations.

Каждый алгоритм принимает **свой совместимый holder**.

Например, концептуально:

```text
WasmRepulsionAlgorithm(WasmPhysicsMemory)
WasmGraphAlgorithm(WasmPhysicsMemory)
WasmZDampingAlgorithm(WasmPhysicsMemory)

WebGpuRepulsionAlgorithm(WebGpuPhysicsMemory)
WebGpuGraphAlgorithm(WebGpuPhysicsMemory)
WebGpuZDampingAlgorithm(WebGpuPhysicsMemory)
```

Алгоритм не работает напрямую с `PointGraphManager`. Он работает через backend-specific holder, который предоставляет ему совместимый physics state и необходимые операции.

Это позволяет сохранить одинаковый physics contract при полностью разной реализации вычислений.

---

## 6. Аналогия с EnginePipeline

Архитектурно backend holder похож на небольшой специализированный `EnginePipeline`.

Текущий `EnginePipeline`:

```text
AnimationEngine
      │
      ▼
EnginePipeline
      │
      ├── algorithm 1
      ├── algorithm 2
      └── algorithm 3
```

Новый backend:

```text
WasmPhysicsMemory
      │
      ├── WasmRepulsion
      ├── WasmGraph
      └── WasmZDamping

WebGpuPhysicsMemory
      │
      ├── WebGpuRepulsion
      ├── WebGpuGraph
      └── WebGpuZDamping
```

Разница в ответственности:

- `AnimationEngine` отвечает за **когда** выполнять callback;
- backend holder отвечает за **как** хранить state и **как** выполнить backend physics;
- algorithm отвечает за конкретную физическую операцию.

Поэтому backend holder содержит собственный порядок выполнения:

```text
Repulsion
    ↓
Graph
    ↓
Z-damping
```

и собственный backend-specific механизм dispatch/kernel execution.

---

## 7. Factory / общий physics contract

Количество реализаций естественным образом образует две семьи backend-алгоритмов:

```text
             Physics contract
                    │
          ┌─────────┴─────────┐
          │                   │
        WASM                WebGPU
          │                   │
    ┌─────┼─────┐       ┌─────┼─────┐
    │     │     │       │     │     │
 Repulsion Graph Z     Repulsion Graph Z
```

Это допускает применение фабричного подхода для создания согласованного набора алгоритмов одного backend.

Однако сама структура не является буквально классическим **Abstract Factory**: главная ответственность находится не в factory, а в backend holder, который владеет состоянием и жизненным циклом выполнения. Abstract Factory может использоваться как механизм создания семейства backend-specific algorithms.

Главный архитектурный контракт:

> Выбор backend меняет конкретные реализации алгоритмов и механизм выполнения, но не меняет порядок и математическую семантику physics.

---

## 8. Выбор активного backend и защита от конфликтов

WASM и WebGPU не должны одновременно выполнять physics для одного PointGraphManager.

В приложении может существовать два созданных backend holder:

`Index
  │
  ├── WasmPhysicsMemory
  └── WebGpuPhysicsMemory`

но в каждый момент времени существует ровно один **active physics backend**.

`text
             Physics Backend
                    │
          ┌─────────┴─────────┐
          │                   │
        WASM                WebGPU
          │                   │
       ACTIVE              INACTIVE
`

Неактивный backend:

- не регистрирует physics callbacks в AnimationEngine;
- не выполняет physics algorithms;
- не обрабатывает physics-related mediator events;
- не записывает координаты обратно в PointGraphManager.

Это основной механизм предотвращения конфликта двух backend.

### Backend interface

Оба backend предоставляют единый публичный интерфейс, например концептуально:

`text
PhysicsBackend
    ├── initialize()
    ├── activate()
    ├── deactivate()
    ├── syncFromPointGraph()
    ├── syncToPointGraph()
    └── destroy()
`

Конкретный TypeScript API будет определён на этапе реализации.

`activate()` означает, что backend становится единственным владельцем текущего physics execution cycle.

`deactivate()` должен остановить execution и снять все подписки/регистрации, относящиеся к активному physics backend.

Переключение не должно просто менять enum или флаг. Оно должно менять **активный execution owner**.

### Static factory

Создание каждого backend выполняется через статическую factory.

Концептуально:

`text
WasmPhysicsMemory.create(...)
WebGpuPhysicsMemory.create(...)
`

или через соответствующие backend factories.

Factory обязана проверить возможность создания backend и выбросить ошибку, если backend невозможно создать.

Проверки включают как минимум:

- наличие требуемого browser API;
- возможность инициализации backend runtime;
- возможность создания необходимых backend resources;
- корректность обязательных возможностей устройства/окружения.

Для WebGPU это означает проверку доступности WebGPU и успешного получения необходимых GPU resources.

Для WASM это означает проверку возможности загрузки/инициализации WASM runtime и требуемого модуля.

Ошибка factory является **ошибкой создания конкретного backend**, а не обязательно ошибкой всего приложения.

Поэтому Index создаёт backend независимо:

`text
try create WASM
       │
       ├── success → backend available
       └── failure → backend unavailable

try create WebGPU
       │
       ├── success → backend available
       └── failure → backend unavailable
`

Если один backend недоступен, это не должно блокировать использование другого.

### Переключатель находится в Index

Index является composition root приложения и поэтому владеет связыванием:

`text
React UI
   │
   ▼
AppMediator
   │
   │ physics-backend-changed
   ▼
Index
   │
   ├── activate WASM
   └── activate WebGPU
`

React UI не должен напрямую создавать WasmPhysicsMemory или WebGpuPhysicsMemory.

UI знает только публичный интерфейс выбора backend и вызывает метод медиатора, например концептуально:

`text
mediator.physicsBackendChanged("wasm")
mediator.physicsBackendChanged("webgpu")
`

Index подписывается на это событие и выполняет фактическое переключение.

Это сохраняет границы:

- React — отображает переключатель;
- AppMediator — передаёт команду;
- Index — управляет composition/runtime wiring;
- backend holder — выполняет physics;
- PointGraphManager — хранит domain state.

### Безопасное переключение

Переключение выполняется последовательно:

`text
active backend
      │
      ▼
deactivate()
      │
      ▼
sync current result if required
      │
      ▼
new backend
      │
      ▼
syncFromPointGraph()
      │
      ▼
activate()
`

Новый backend перед активацией получает актуальное состояние из PointGraphManager.

Поэтому backend не должен продолжать вычисление со старым состоянием после переключения.

Критический инвариант:

> В каждый момент времени только один backend имеет право выполнять physics и записывать physics result обратно в PointGraphManager.

### Состояние переключателя в UI

UI-переключатель должен показывать только backend, которые успешно созданы и доступны.

Например:

`text
Physics backend:
  ○ WASM
  ○ WebGPU
`

Если WebGPU factory завершилась ошибкой, UI получает состояние вида:

`text
WASM    available
WebGPU  unavailable
`

и не предлагает выполнить переключение на недоступный backend.

Причина ошибки может быть доступна для diagnostics, но UI не должен самостоятельно проверять WebGPU/WASM capabilities.

### Создание и переключение не смешиваются

Важно различать две операции:

1. **Factory creation** — можно ли вообще создать backend.
2. **Activation** — какой из уже созданных backend сейчас выполняет physics.

Factory отвечает за первое. Index отвечает за второе.

Это позволяет иметь оба backend созданными для исследовательского сравнения, но исключает их одновременное выполнение.

---

## 9. Взаимодействие с AppMediator

Backend holders подписываются на необходимые события `AppMediator`.

Особенно важно событие изменения позиции точки.

Holder **не должен знать, что изменение произошло из-за drag**. Drag — это ответственность `PointsScene`/UI.

Для backend это всего лишь событие:

```text
AppMediator
    │
    │ point-updating / point-updated
    │ { pointId }
    ▼
WasmPhysicsMemory
WebGpuPhysicsMemory
```

Payload mediator event содержит идентификатор точки, а не полную структуру `Point`.

Получив `pointId`, каждый holder:

1. определяет соответствующий backend buffer index;
2. самостоятельно получает актуальное состояние точки из своего `PointGraphManager`;
3. обновляет только необходимую область backend state.

То есть поток выглядит так:

```text
PointsScene
    │
    ▼
AppMediator.point-updating(pointId)
    │
    ├──────────────────────┐
    ▼                      ▼
WasmPhysicsMemory    WebGpuPhysicsMemory
    │                      │
    │ read PointGraphManager
    │                      │
    ▼                      ▼
update WASM state     update GPU state
```

Backend holders не должны зависеть друг от друга и не должны пересылать друг другу изменения.

---

## 9. Holder читает PointGraphManager по необходимости

`PointGraphManager` передаётся holder в конструкторе как основной domain source.

Это не означает постоянную синхронизацию всего массива.

Holder самостоятельно определяет, когда ему требуется чтение:

### Полная синхронизация

Используется при:

- первоначальной инициализации backend;
- добавлении/удалении большого набора данных;
- полном rebuild;
- явном запросе полной синхронизации.

Поток:

```text
PointGraphManager
       │
       │ read current state
       ▼
Backend holder
       │
       ▼
backend physics state
```

### Точечная синхронизация

Используется при изменении одной точки:

```text
pointId
   │
   ▼
PointGraphManager
   │
   │ read current Point
   ▼
Backend holder
   │
   ▼
buffer[index]
```

### Выгрузка результата

После выполнения physics holder при необходимости переносит актуальные координаты обратно в `PointGraphManager`:

```text
backend state
    │
    │ download / readback
    ▼
PointGraphManager
    │
    ▼
existing Point objects
```

Таким образом, holder сам управляет частотой и объёмом синхронизации. Нет требования постоянно копировать `Point[]`.

---

## 10. Полный physics pass

Для backend выполняется:

```text
PointGraphManager
        │
        │ read/upload when required
        ▼
backend holder
        │
        ├── Repulsion
        ├── Graph physics
        └── Z-damping
        │
        │ write back when required
        ▼
PointGraphManager
        │
        ▼
D3 / SVG
```

Между отдельными physics запрещены промежуточные:

- backend → JavaScript;
- JavaScript → backend.

Таким образом, не должно быть цепочки `JS → GPU → JS → GPU → JS` между отдельными алгоритмами.

---

## 11. Явные операции синхронизации

Backend holder должен концептуально предоставлять операции:

```text
syncFromPointGraph()
    ↓
backend physics state
    ↓
runPhysicsStep(...)
    ↓
syncToPointGraph()
```

Для частичного изменения:

```text
pointId
    ↓
syncPointFromPointGraph(pointId)
    ↓
backend buffer
```

Названия методов являются концептуальными и не фиксируют окончательный TypeScript API.

### Upload / sync from

Первичная синхронизация переносит необходимые данные из `PointGraphManager` в backend state.

Полная повторная загрузка требуется только тогда, когда holder считает её необходимой или получена команда полной синхронизации.

### Download / sync to

Синхронизация обратно обновляет существующие `Point` in-place.

Новый `Point[]` не создаётся. После синхронизации существующие D3/SVG сцены продолжают работать с теми же объектами.

---

## 12. Изменение одной точки

Для изменения одной точки не требуется повторно загружать весь массив.

Концептуально:

```text
AppMediator.point-updating(pointId)
            │
            ▼
backend holder
            │
            ├── PointGraphManager.get(pointId)
            │
            ▼
updatePoint(index, state)
            │
            ▼
backend buffer
```

Это одинаковый логический контракт для WASM и WebGPU, хотя конкретный механизм записи различается.

---

## 13. Mapping Point → buffer index

Backend работает с индексами, а domain-модель идентифицирует точки через `Point.id`.

Нужен явный контракт:

```text
Point.id ↔ physics buffer index
```

Нельзя считать индекс неизменным навсегда: `EntityCollection` использует swap-with-last при удалении.

Поэтому mapping должен корректно обновляться при:

- добавлении точки;
- удалении точки;
- обновлении одной точки;
- передаче graph edges в backend.

Mapping является частью ответственности backend holder, а не mediator.

---

## 14. Physics state layout

Минимально state должен представлять:

- `x`;
- `y`;
- `z`;
- fixed/non-fixed состояние;
- соответствие point index.

Для Graph physics нужны индексы:

```text
edge → source index + target index
```

Точный layout пока не фиксируется. Возможны AoS и SoA. Выбор должен быть сделан после анализа требований WASM и WGSL, а не случайно вслед за первой реализацией.

---

## 15. Physics algorithms

Backend сохраняет математическую семантику текущих алгоритмов.

### Repulsion

Текущая реализация имеет сложность порядка `O(N²)`. Первая WASM/WebGPU версия не должна одновременно менять математический алгоритм: иначе сравнение backend будет смешивать изменение backend и изменение алгоритма.

Оптимизация алгоритма, например spatial grid или Barnes-Hut, является отдельным исследованием.

### Graph physics

Текущая сложность порядка `O(E)`.

На GPU наивный edge-parallel kernel с одновременной записью обоих endpoint может создать race condition. Поэтому GPU-реализация должна использовать безопасную схему накопления/агрегации изменений.

### Z-damping

Z-damping остаётся отдельным pass и использует тот же backend state.

---

## 16. Порядок physics

Для обоих backend:

```text
Repulsion
    ↓
Graph physics
    ↓
Z-damping
```

Все три алгоритма используют один state соответствующего holder.

---

## 17. WebGPU

Целевой GPU backend — именно WebGPU Compute + WGSL:

```text
WebGPU
    ↓
WebGpuPhysicsMemory
    ↓
GPUBuffer
    ↓
Compute Pipeline
    ↓
WGSL kernels
```

WebGL не является целевым backend.

WebGPU holder отвечает за backend-specific:

- `GPUBuffer`;
- bind groups;
- compute pipelines;
- command encoding;
- dispatch;
- synchronization/readback.

Все physics kernels используют общий GPU state. Объединение kernels или иные dispatch-оптимизации рассматриваются после получения корректной базовой реализации и измерений.

---

## 18. WASM

WASM backend использует собственную linear memory:

```text
PointGraphManager
    ↓
WasmPhysicsMemory
    ↓
WASM linear memory
    ↓
WASM kernels/functions
    ↓
Repulsion
    ↓
Graph
    ↓
Z-damping
    ↓
WasmPhysicsMemory
    ↓
PointGraphManager
```

WASM holder отвечает за backend-specific:

- выделение и управление linear memory;
- layout physics state;
- передачу данных в WASM;
- вызов WASM functions/kernels;
- получение результатов;
- lifecycle WASM instance.

Реализация может быть выполнена, например, на Rust или C++. Выбор языка не должен менять physics contract.

---

## 19. JavaScript и D3/SVG

Пока renderer остаётся SVG/D3, WebGPU physics неизбежно требует GPU → CPU → JavaScript readback для передачи актуальных координат SVG.

Поэтому benchmark должен отделять:

- время GPU physics;
- GPU readback;
- обновление `Point[]`;
- D3/SVG update;
- полный pass/frame.

Нельзя оценивать backend только по времени compute kernels.

---

## 20. Численная точность

JavaScript `number` и backend `float32` могут давать небольшие расхождения.

До реализации необходимо определить:

- формат координат;
- допустимую абсолютную/относительную погрешность;
- правила сравнения WASM/WebGPU с reference implementation.

Побитовое совпадение не следует требовать при различающейся floating-point precision.

---

## 21. Граница ответственности

`PointGraphManager` не должен знать детали Rust/WASM или WebGPU.

Он остаётся domain storage и источником истины.

```text
PointGraphManager
       │
       │ domain state
       │
 ┌─────┴─────────────────────────┐
 │                               │
 ▼                               ▼
WasmPhysicsMemory          WebGpuPhysicsMemory
 │                               │
 ├─ state                        ├─ state
 ├─ sync                         ├─ sync
 ├─ algorithms                   ├─ algorithms
 └─ execution core               └─ execution core
 │                               │
 ▼                               ▼
WASM runtime                 WebGPU runtime
```

Медиатор также не должен знать backend details. Он сообщает события и небольшие идентификаторы/состояния.

Backend holder получает domain data напрямую из `PointGraphManager`, когда это необходимо.

---

## 22. Что не входит в эту фиксацию

Здесь не реализуются:

- WASM backend;
- WebGPU backend;
- WGSL kernels;
- новый physics algorithm;
- перенос SVG/D3 на GPU;
- автоматические backend-тесты;
- конкретный WASM ABI;
- окончательный AoS/SoA layout;
- окончательный mapping API;
- benchmark harness.

---

## 23. Ключевые инварианты

1. `PointGraphManager` остаётся domain source of truth.
2. WASM и WebGPU имеют собственные physical storage.
3. Каждый backend holder получает `PointGraphManager` в конструкторе.
4. Backend holders независимы друг от друга.
5. Holder не является пассивным buffer wrapper: он также является backend execution core.
6. Три логических physics algorithm имеют шесть backend-specific реализаций.
7. Каждый algorithm работает со своим совместимым backend holder.
8. Медиатор передаёт события, а не большие структуры данных.
9. При изменении точки holder получает `pointId` и сам читает актуальный `Point` из `PointGraphManager`.
10. Holder самостоятельно определяет необходимость полной или частичной синхронизации.
11. Drag не является частью backend contract; backend видит только изменение точки.
12. Один backend выполняет Repulsion → Graph → Z-damping на одном состоянии.
13. Между алгоритмами одного backend нет промежуточного JS readback/upload.
14. Существующие `Point` обновляются in-place.
15. Изменение одной точки не требует полной загрузки.
16. Graph edges передаются как buffer indices, а не JS object references.
17. WASM и WebGPU сохраняют одну математическую семантику.
18. WebGPU использует WebGPU/WGSL, а не WebGL.
19. GPU readback и D3/SVG учитываются отдельно при benchmark.
20. Swap-with-last в `EntityCollection` не должен ломать point → buffer index mapping.
21. `PointGraphManager` не знает деталей конкретного backend.
22. `AppMediator` не становится транспортом backend state.
23. В каждый момент времени активен только один physics backend.
24. Неактивный backend не выполняет physics и не пишет результаты в `PointGraphManager`.
25. Создание backend выполняется через static factory с обязательной проверкой capabilities.
26. Ошибка создания одного backend не должна автоматически делать недоступным другой backend.
27. UI не создаёт backend напрямую.
28. UI сообщает выбор backend через `AppMediator`.
29. `Index` является composition root и выполняет фактическое переключение active backend.
30. Перед активацией нового backend его state синхронизируется из `PointGraphManager`.

---

## 24. Следующий этап

До реализации необходимо отдельно определить:

1. точный physics state layout;
2. API holder `syncFromPointGraph` / `syncToPointGraph` / `syncPointFromPointGraph`;
3. lifecycle синхронизации при add/remove;
4. `Point.id ↔ buffer index`;
5. представление edges;
6. безопасный GPU Graph physics;
7. floating-point contract;
8. WASM ABI;
9. WebGPU buffer layout и bind groups;
10. способ создания согласованного набора из трёх algorithms для каждого backend;
11. backend public interface: initialize / activate / deactivate / sync / destroy;
12. static factory и capability checks;
13. lifecycle переключения active backend;
14. benchmark contract.

После согласования этих решений WASM и WebGPU backend можно реализовывать независимо, сохраняя единый physics contract.
