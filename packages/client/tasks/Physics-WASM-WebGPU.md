# Задача: Physics — WASM и WebGPU backend

## 1. Цель

Реализовать и исследовать перенос browser physics в backend-варианты JavaScript, WebAssembly и WebGPU compute shaders (WGSL).

Исследование обязательно включает оба backend — WASM и WebGPU.

Главный архитектурный принцип: backend меняет способ выполнения конкретного algorithm, но не меняет domain model, общий physics contract и порядок algorithms в EnginePipeline.

Текущий логический порядок:

~~~text
Repulsion
    ↓
Graph
    ↓
Z-damping
~~~

На текущем этапе backend-реализации существуют для всех трёх algorithms: Repulsion, Graph и Z-damping. Для WASM и WebGPU реализованы отдельные backend algorithms, при этом EnginePipeline остаётся единым. JavaScript сохраняется как fallback. Архитектура не должна зависеть от конкретного backend.

## 2. Источник истины

Источник истины для domain state:

~~~text
PointGraphManager
    ↓
Point[]
~~~

Point[] сохраняет существующую семантику: стабильная ссылка на массив, изменение объектов Point in-place.

WASM и WebGPU не становятся вторым domain source of truth.

Backend storage является рабочей копией physics state:

~~~text
                 PointGraphManager
                 domain source of truth
                         │
             ┌───────────┴───────────┐
             │                       │
             ▼                       ▼
       WASM memory              GPUBuffer
             │                       │
       WASM algorithm           WebGPU algorithm
             │                       │
             └───────────┬───────────┘
                         ▼
                 PointGraphManager
~~~

Синхронизацию выполняет соответствующий transformer.

## 3. Один EnginePipeline

Не создаются JsPhysicsPipeline, WasmPhysicsPipeline или WebGpuPhysicsPipeline.

Существующий EnginePipeline остаётся общей архитектурой:

~~~text
AnimationEngine
      │
      ▼
EnginePipeline
      │
      ├── Repulsion
      ├── Graph
      └── Z-damping
~~~

Используется один экземпляр EnginePipeline. Backend selection меняет его configuration через setConfiguration(...).

Backend не создаёт собственный pipeline.

## 4. Composition root

Composition root находится в:

~~~text
packages/client/src/index.ts
~~~

Он отвечает за связывание AppMediator, AnimationEngine, PointGraphManager, EnginePipeline, algorithms, backend и transformers.

При этом index.ts не должен знать backend-specific source code.

Source URL для z-damping.cpp и z-damping.wgsl создаётся непосредственно внутри соответствующего algorithm.

То есть composition root знает, какой algorithm подключить, но не знает, из какого source file он реализован.

## 5. Конфигурации создаются один раз

Конфигурации являются общими для логических algorithms и не зависят от backend.

В index.ts создаётся один набор:

~~~text
PhysicsConfigurations
 ├── repulsion: RepulsionEngineConfig
 ├── graph: GraphEngineConfig
 └── zdamping: ZDampingConfig
~~~

Этот набор передаётся при построении любого варианта pipeline.

Даже если текущий backend использует только zdamping, он получает весь набор из трёх конфигураций.

Это единая точка будущих настроек и расширения. Конфигурации не должны дублироваться для JS/WASM/WebGPU.

## 6. Generic backend

Текущие backend находятся в:

~~~text
packages/client/src/core/Backends/WasmBackend.ts
packages/client/src/core/Backends/WebGpuBackend.ts
~~~

Backend отвечает только за технологический уровень.

WasmBackend:
- проверяет WebAssembly;
- загружает .wasm;
- создаёт WebAssembly.Instance;
- хранит несколько instance по ID;
- предоставляет работу с WebAssembly.Memory;
- выполняет allocation;
- читает/пишет memory;
- вызывает exported function;
- уничтожает instance.

WebGpuBackend:
- проверяет navigator.gpu;
- получает adapter и device;
- загружает WGSL;
- создаёт shader module;
- создаёт compute pipeline;
- создаёт bind group;
- создаёт, записывает и читает GPUBuffer;
- отправляет compute commands;
- выполняет readback;
- уничтожает backend resources.

Backend не знает PointGraphManager, Repulsion, Graph, Z-damping и physics semantics.

## 7. Backend algorithm

Конкретный algorithm получает generic backend и transformer.

~~~text
WasmZDapperAlgorithm
      │
      ├── WasmBackend
      └── WasmPointsTransformer

WebGpuZDapperAlgorithm
      │
      ├── WebGpuBackend
      └── WebGpuPointsTransformer
~~~

Algorithm отвечает за:
- свою physics semantics;
- выбор backend operation;
- создание backend instance;
- создание необходимых execution resources;
- вызов backend execution;
- получение temperature;
- lifecycle своего backend instance.

Algorithm не отвечает за domain storage и renderer.

## 8. Source URL принадлежит algorithm

WASM algorithm сам создаёт URL z-damping.cpp.

WebGPU algorithm сам создаёт URL z-damping.wgsl.

index.ts не передаёт source URL backend connector-у.

Это сохраняет границу:

~~~text
index.ts
   │
   └── выбирает и связывает algorithm
          │
          ▼
backend-specific algorithm
          │
          └── знает свой source
~~~

## 9. Transformer

Transformer является границей между domain state и backend memory.

Текущие transformers:

~~~text
packages/client/src/physics/wasm/WasmPointsTransformer.ts
packages/client/src/physics/webgpu/WebGpuPointsTransformer.ts
~~~

Transformer получает PointGraphManager и соответствующий backend.

Он знает:
- как прочитать PointGraphManager;
- как преобразовать Point в backend layout;
- где находится backend storage;
- как записать state в backend;
- как вернуть результат обратно в PointGraphManager.

Transformer не знает physics semantics.

## 10. Полная и частичная синхронизация

Полная:

~~~text
PointGraphManager
      ↓
transformer.load()
      ↓
backend memory
~~~

После завершения synchronization boundary pipeline:

~~~text
backend memory
      ↓
Save step
      ↓
transformer.save()
      ↓
PointGraphManager
~~~

Algorithm не обязан выполнять `save()` после своего шага. Если следующий algorithm использует тот же backend storage, результат должен оставаться в backend memory.

Для будущих событий изменения отдельной точки предусмотрены loadPoint(index) и savePoint(index).

Это позволяет позднее обновлять backend state без полной перезагрузки массива.

## 11. Point layout

Backend state использует фиксированный stride:

~~~text
x       float32
y       float32
z       float32
fixed   int32
----------------
16 bytes
~~~

fixed намеренно является int32, а не float32.

Причины:
- сохраняется 16-byte layout;
- это дискретное состояние;
- поле можно расширить до bit flags;
- C++ и WGSL получают одинаковое представление.

WASM:

~~~cpp
struct PointState {
  float x;
  float y;
  float z;
  int32_t fixed;
};
~~~

WGSL:

~~~wgsl
struct PointState {
  x: f32,
  y: f32,
  z: f32,
  fixed: i32,
};
~~~

## 12. WASM implementation

Source:

~~~text
packages/client/src/physics/wasm/z-damping.cpp
~~~

Runtime module:

~~~text
packages/client/src/physics/wasm/z-damping.wasm
~~~

The `.wasm` file is a generated build artifact and is intentionally not stored in Git.

The client build has an on-demand WASM compilation step:

~~~text
z-damping.wasm exists
        ↓
use existing module

z-damping.wasm missing
        ↓
clang++ --target=wasm32 ...
        ↓
z-damping.wasm
~~~

The build script is `packages/client/scripts/build-wasm.mjs`. It runs before client debug and release builds. A clean checkout therefore does not require a committed binary, while an already generated module is reused.

Export:

~~~text
z_damping
~~~

Lifecycle:

~~~text
WasmZDapperAlgorithm
      ↓
WasmPointsTransformer.load()
      ↓
WebAssembly.Memory
      ↓
z_damping(...)
      ↓
WasmPointsTransformer.save()
      ↓
PointGraphManager
~~~

WASM module загружается через fetch и создаётся WebAssembly.Instance.

Браузер не компилирует C++ непосредственно при запуске. C++ должен быть заранее собран в WASM module.

Текущий C++ алгоритм:
- fixed points не изменяются;
- точки с abs(z) <= threshold не изменяются;
- z' = z * (1 - dampingFactor);
- значения около нуля обнуляются;
- temperature = максимум abs(z' - z).

## 13. WASM memory

Каждый WASM module instance имеет собственную exported WebAssembly.Memory.

WasmBackend хранит instance state по ID.

После initialize:

~~~text
backend.createInstance(...)
        ↓
instanceId
        ↓
transformer.attachInstance(instanceId)
~~~

Allocation выполняется внутри memory соответствующего instance.

Это позволяет поддерживать несколько algorithm instances без смешивания memory state.

## 14. WebGPU implementation

Source:

~~~text
packages/client/src/physics/webgpu/z-damping.wgsl
~~~

Entry points:

~~~text
updatePoints
reduceTemperature
~~~

Lifecycle:

~~~text
WebGpuZDapperAlgorithm
      ↓
WebGpuPointsTransformer.load()
      ↓
GPUBuffer
      ↓
updatePoints
      ↓
reduceTemperature
      ↓
copy/readback
      ↓
WebGpuPointsTransformer.save()
      ↓
PointGraphManager
~~~

## 15. WebGPU temperature reduction

Temperature — максимум displacement.

Первый pass:

~~~text
point displacement
      ↓
local workgroup reduction
      ↓
workgroupMaxima
~~~

Второй pass:

~~~text
workgroupMaxima
      ↓
single workgroup reduction
      ↓
temperature[0]
~~~

Текущий prototype использует workgroup size 256 и максимум 256 workgroups, то есть максимум 65 536 точек для этого двухпроходного reduction.

Это ограничение prototype, а не общий предел WebGPU.

## 16. WebGPU buffers

WebGpuPointsTransformer владеет:
- point storage buffer;
- full readback buffer;
- one-point readback buffer;
- capacity;
- count.

Поэтому transformer.save() не получает внешний readback buffer: transformer использует собственный storage.

Algorithm получает buffer handles только через публичные методы transformer, когда они необходимы для bind group и copy commands.

## 17. WebGPU async boundary

GPU execution и readback асинхронны.

Реальный prototype step выполняется через общий async contract BaseAlgorithm:

~~~text
BaseAlgorithm.stepAsync(deltaTime)
        ↓
WebGpuZDapperAlgorithm.applyStepAsync(deltaTime)
        ↓
GPU compute + readback
~~~

AnimationEngine не знает о WASM или WebGPU. Async contract является generic, а EnginePipeline последовательно ожидает каждый algorithm step.

## 18. Backend fallback

В composition root создаётся один EnginePipeline.

На текущем состоянии ветки experimental configuration пытается:

~~~text
create EnginePipeline once
        ↓
try WebGPU
        │
        ├── success → setConfiguration(...)
        │
        └── failure
              ↓
         try WASM
              │
              ├── success → setConfiguration(...)
              │
              └── failure
                    ↓
              default JS pipeline
~~~

Таким образом fallback меняет configuration одного pipeline, а не создаёт новый pipeline.

Текущий порядок попыток в index.ts: WebGPU → WASM → default JS.

## 19. Default и experimental configurations

Default:

~~~text
JS Repulsion
JS Graph
JS Z-damping
~~~

WASM:

~~~text
WASM Repulsion
WASM Graph
WASM Z-damping
~~~

WebGPU:

~~~text
WebGPU Repulsion
WebGPU Graph
WebGPU Z-damping
~~~

Это текущие experimental configurations. Default configuration остаётся полностью JavaScript. Все три backend-варианта используют один EnginePipeline; различается только набор concrete algorithm implementations.

## 20. Shared mathematical semantics

Для Z-damping JavaScript, WASM и WebGPU должны использовать одну математическую семантику:

~~~text
if fixed:
    unchanged

if abs(z) <= threshold:
    unchanged

z' = z * (1 - dampingFactor)

if abs(z') < epsilon:
    z' = 0

temperature = abs(z' - z)

overall temperature = max(displacement)
~~~

Floating-point differences допустимы в пределах ожидаемой численной погрешности, но смысл algorithm должен оставаться одинаковым.

Temperature является величиной фактического изменения состояния.

## 21. Будущее расширение до полного backend physics

После Z-damping потенциальная структура:

~~~text
WASM:
  WasmRepulsionAlgorithm
  WasmGraphAlgorithm
  WasmZDapperAlgorithm

WebGPU:
  WebGpuRepulsionAlgorithm
  WebGpuGraphAlgorithm
  WebGpuZDapperAlgorithm
~~~

При этом pipeline остаётся один:

~~~text
EnginePipeline
    ├── Repulsion
    ├── Graph
    └── Z-damping
~~~

Меняются только конкретные implementations algorithms.

## 22. Graph physics

Graph physics нельзя механически переносить из JavaScript в WGSL.

Возможна конкурентная запись:

~~~text
edge A ──→ point X
edge B ──→ point X
~~~

Поэтому до WebGPU Graph необходимо исследовать:
- accumulation model;
- ownership записи координат;
- промежуточные buffers;
- atomic operations, если они действительно нужны;
- количество passes;
- synchronization cost.

## 23. Repulsion

Repulsion потенциально имеет большую вычислительную стоимость, включая попарные взаимодействия.

Перед переносом необходимо исследовать:
- memory access pattern;
- workgroup organization;
- spatial partitioning, если потребуется;
- количество dispatch;
- промежуточные buffers;
- CPU/GPU synchronization.

Буквальный перенос JavaScript loop не считается автоматически приемлемым GPU algorithm.

## 24. Возможные execution models

Архитектура не фиксирует заранее один способ организации kernels.

WebGPU может использовать:
- отдельные entry points;
- один shader module с несколькими entry points;
- несколько compute passes;
- объединённые passes, если это оправдано зависимостями и измерениями.

WASM может использовать:
- один module с несколькими exported functions;
- несколько modules;
- общий state;
- отдельные compiled units.

Решение принимается по:
1. корректности;
2. upload/readback cost;
3. dispatch count;
4. synchronization cost;
5. reuse state;
6. производительности;
7. сложности сопровождения.

## 25. Domain state и backend state

Логически physics state один, физически storage разный:

~~~text
PointGraphManager
       │
       ├── WASM storage
       │
       └── WebGPU storage
~~~

Нельзя предполагать прямой alias между WebAssembly.Memory и обычным WebGPU GPUBuffer.

Две физические копии не означают два domain sources of truth.

## 26. Partial synchronization

loadPoint(index) и savePoint(index) подготовлены для будущего уменьшения upload/readback.

Backend не должен знать, почему точка изменилась. Drag является ответственностью UI/scene.

Для backend существует только изменение point state.

## 27. Renderer synchronization

Renderer остаётся JavaScript/D3/SVG.

Backend result возвращается в существующие Point:

~~~text
backend physics
      ↓
save / savePoint
      ↓
PointGraphManager
      ↓
Point[]
      ↓
D3 / SVG
~~~

Backend не создаёт отдельную render model.

## 27. Синхронизация между несколькими backend algorithms

Важное архитектурное уточнение: backend algorithm не должен автоматически выгружать результат обратно в PointGraphManager после каждого своего шага.

Если несколько algorithms последовательно работают в одном backend storage, предпочтительная схема:

~~~text
Load
  ↓
Repulsion
  ↓
Graph
  ↓
Z-damping
  ↓
Save
~~~

Если, например, Repulsion и Graph выполняются на GPU, схема не должна превращаться в:

~~~text
GPU → PointGraphManager → GPU → PointGraphManager → GPU
~~~

Такой промежуточный readback/upload не нужен: следующий algorithm может продолжить работу непосредственно с тем же backend storage.

### 27.1 Отдельные pipeline steps

Pipeline должен иметь явные synchronization steps:

~~~text
Load
  ↓
Algorithm 1
  ↓
Algorithm 2
  ↓
Algorithm 3
  ↓
Save
~~~

`Load` выполняет начальную передачу domain state в выбранный backend storage.

Algorithms работают над уже загруженным состоянием и не выполняют обязательный `save()` после каждого шага.

`Save` выполняет финальную передачу результата обратно в `PointGraphManager`.

Таким образом, synchronization становится свойством pipeline execution, а не ответственностью конкретного physics algorithm.

### 27.2 Backend storage должен жить дольше одного algorithm

Transformer/backend storage должен быть пригоден для последовательного использования несколькими algorithms одного backend.

Для WebGPU:

~~~text
GPUBuffer
   ↓
Repulsion compute
   ↓
same GPUBuffer
   ↓
Graph compute
   ↓
same GPUBuffer
   ↓
Z-damping compute
   ↓
same GPUBuffer
~~~

Для WASM аналогично:

~~~text
WASM memory
   ↓
Repulsion
   ↓
same memory
   ↓
Graph
   ↓
same memory
   ↓
Z-damping
~~~

Это позволяет избежать ненужных копирований и особенно дорогих GPU readback/upload операций.

### 27.3 Разделение ответственности

Algorithm отвечает за вычисление:

~~~text
Algorithm
    ↓
transform backend state
    ↓
compute
    ↓
updated backend state
~~~

Pipeline отвечает за границы синхронизации:

~~~text
Load
    ↓
algorithms
    ↓
Save
~~~

Transformer отвечает за механизм преобразования между PointGraphManager и backend storage, но не решает, когда pipeline должен выполнять synchronization.

### 27.4 Важное следствие для Repulsion и Graph

При реализации следующих algorithms сначала необходимо определить, могут ли они работать непосредственно с storage предыдущего algorithm.

Предпочтительная модель для одного backend:

~~~text
Load
 ↓
Repulsion
 ↓
Graph
 ↓
Z-damping
 ↓
Save
~~~

а не:

~~~text
Load
 ↓
Repulsion
 ↓
Save
 ↓
Load
 ↓
Graph
 ↓
Save
 ↓
Load
 ↓
Z-damping
 ↓
Save
~~~

Исключения допустимы только тогда, когда конкретному algorithm действительно нужен CPU/domain state или backend сменился.

Это решение является важной частью будущего полного WASM/WebGPU pipeline и должно учитываться до реализации Repulsion и Graph.

## 28. Lifecycle и ошибки

Backend-specific algorithm должен иметь lifecycle:

~~~text
create backend
    ↓
create algorithm
    ↓
initialize
    ↓
execute
    ↓
destroy
~~~

Ошибка создания конкретного backend означает, что этот backend недоступен для текущей configuration attempt, а не обязательно ошибку всего приложения.

Composition root может перейти к следующему backend или default JS pipeline.

При уничтожении должны освобождаться backend instance, GPU buffers, transformer state и остальные ресурсы, которыми владеет конкретный implementation.

## 29. Ограничения текущего prototype

Сейчас:
- backend реализован для Repulsion, Graph и Z-damping;
- WebGPU execution подключён через async AnimationEngine contract;
- WebGPU reduction ограничен 65 536 точками;
- synchronization вынесена в отдельные pipeline Load/Save steps;
- algorithms могут последовательно работать на одном backend storage без промежуточного readback/upload;
- partial synchronization подготовлена;
- оптимальная организация полного backend pipeline ещё требует измерений.

Это ограничения текущего исследовательского этапа.

## 30. Что не следует делать

Не следует:
- создавать отдельные Js/Wasm/WebGpu PhysicsPipeline;
- создавать новый EnginePipeline для каждого backend;
- передавать source URL из index.ts;
- хранить PointGraphManager внутри generic backend;
- смешивать backend runtime с physics semantics;
- передавать transformer чужие buffer handles для storage, которым он владеет;
- хранить fixed как float;
- делать WebGPU synchronous через блокирующее ожидание;
- переносить Graph в WGSL без решения concurrent writes;
- считать backend memory новым domain source of truth;
- дублировать configuration objects для backend.

## 31. Следующие этапы

1. Сравнить JS/WASM/WebGPU на одинаковом workload.
2. Оптимизировать upload/readback.
3. Измерить полный pipeline.

Измерять отдельно:
- execution time;
- upload time;
- readback time;
- synchronization cost;
- total frame cost;
- temperature;
- численные расхождения.

## 32. Исправления после CI

После реализации backend algorithms PR прошёл несколько последовательных исправлений по результатам CI. Эти исправления не меняют выбранную архитектуру, но фиксируют важные технические границы реализации.

### 32.1. Некорректные переводы строк в исходниках

В нескольких исходниках вместо реальных переводов строк оказались текстовые последовательности \\n. TypeScript воспринимал их как недопустимые символы и typecheck завершался с TS1127.

Исправлено во всех затронутых TypeScript/WGSL файлах: текстовые последовательности заменены реальными переводами строк.

### 32.2. Типизация imports для WebAssembly

WebAssembly.instantiate() не принимал условно построенный объект imports из-за несовместимого выведенного union-типа.

Использован явный тип:

~~~ts
const imports: WebAssembly.Imports = memory
  ? { env: { memory } }
  : {};
~~~

Это особенно важно для общего WebAssembly.Memory: при переданной memory модуль получает её через env.memory, а при отсутствии использует собственную exported memory.

### 32.3. Синхронный abstract contract для WebGPU algorithms

BaseAlgorithm сохраняет синхронный applyStep() для обратной совместимости, даже когда конкретный algorithm имеет настоящий async execution через applyStepAsync().

Поэтому WebGpuRepulsionAlgorithm, WebGpuGraphAlgorithm и WebGpuZDapperAlgorithm явно реализуют applyStep() и завершают его ошибкой с указанием, что WebGPU требует async AnimationEngine support.

Это не попытка выполнять GPU synchronously: synchronous путь намеренно защищён от случайного запуска WebGPU через старый API.

### 32.4. Итог CI

После этих исправлений CI успешно завершился, PR #54 был смержен в dev. Следующие изменения в этой задаче должны исходить из уже проверенного состояния после merge.

## 32. Статус

[x] единый EnginePipeline
[x] setConfiguration для выбора backend
[x] единый набор трёх configurations
[x] generic WASM backend
[x] generic WebGPU backend
[x] WASM transformer
[x] WebGPU transformer
[x] общий point layout
[x] fixed: int32
[x] WASM Z-damping prototype
[x] reproducible on-demand WASM compilation
[x] generated WASM excluded from Git
[x] WebGPU Z-damping prototype
[x] source ownership внутри algorithms
[x] backend fallback composition
[x] async boundary для WebGPU
[x] async callback support в AnimationEngine
[x] включение WebGPU Z-damping в основной pipeline
[x] backend Repulsion
[x] backend Graph
[x] CI/typecheck после реализации backend algorithms
[ ] performance comparison

Документ является одновременно архитектурной документацией и задачей на дальнейшую реализацию/исследование. Он отражает текущее состояние исходников и принятые решения.


## 33. Архитектурное уточнение: BaseBackend, BackendContext и backend buffers

Этот раздел фиксирует новую архитектурную модель, принятую после реализации WASM/WebGPU prototype. Предыдущие разделы, описывающие отдельную memory для каждого algorithm instance и `transformer.attachInstance(...)`, сохраняются выше как история prototype, но **не являются целевой архитектурой**.

### 33.1 BaseBackend и BackendContext — разные понятия

Текущий низкоуровневый `Backend` должен концептуально называться `BaseBackend`.

`BaseBackend` — утилитарный технологический слой. Он ничего не знает о PointGraphManager, Mediator, Transformer, physics semantics или Pipeline.

~~~text
BaseBackend
    ├── memory / buffers
    ├── allocation
    ├── read / write
    ├── module / instance creation
    ├── execution
    └── resource destruction
~~~

Реализации:

~~~text
BaseBackend
    ├── WasmBackend
    └── WebGpuBackend
~~~

WasmBackend работает с WebAssembly.Memory, WebAssembly.Instance и linear memory.

WebGpuBackend работает с GPUDevice, GPUBuffer, compute resources и command execution.

Отдельно вводится `BackendContext`. Это не новый тип backend API, а lifecycle-окружение конкретной backend configuration:

~~~text
BackendContext
├── BaseBackend
├── Transformers[]
├── Algorithms[]
└── EnginePipeline
~~~

BackendContext знает участников своей конфигурации и отвечает за их связывание и уничтожение.

Transformer и Algorithm **не принадлежат BaseBackend**. Они входят в одно BackendContext.

### 33.2 Lifecycle BackendContext

При создании:

~~~text
create BaseBackend
      ↓
create Transformers
      ↓
subscribe Transformers to Mediator
      ↓
create Algorithms
      ↓
create/configure EnginePipeline
~~~

При уничтожении порядок должен учитывать зависимости:

~~~text
Algorithms.dispose()
      ↓
Transformers.dispose()
      ↓
BaseBackend.dispose()
~~~

Transformer должен отписаться от Mediator до уничтожения backend resources.

Это особенно важно при смене backend:

~~~text
BackendContext(WASM)
        ↓
dispose
        ↓
BackendContext(WebGPU)
~~~

Старые WASM transformers не должны продолжать получать Mediator events после переключения на WebGPU.

### 33.3 Transformer хранит backend buffer

Transformer является владельцем backend-представления соответствующей domain model.

Например:

~~~text
PointGraphManager
       ↕
PointsTransformer
       ↕
Backend Buffer
~~~

Transformer:
- знает свою domain model;
- получает её изменения через Mediator;
- сериализует model state в backend representation;
- хранит backend buffer/resource;
- применяет backend state обратно к model;
- освобождает свой resource при dispose.

Transformer не знает physics semantics и не принадлежит конкретному Algorithm.

Один Transformer может использоваться несколькими Algorithms.

Один Algorithm может использовать несколько Transformers.

Таким образом, связь является many-to-many:

~~~text
Repulsion ───────→ Points
Graph ───────────→ Points + Edges
Z-damping ───────→ Points
Other algorithm ─→ Points + Texture + ...
~~~

### 33.4 Buffer — backend-specific resource handle

Результат `Transformer.getBuffer()` должен представлять backend resource, а не случайный внутренний объект Transformer.

Абстрактно:

~~~text
Transformer.getBuffer()
        ↓
Backend Buffer
~~~

Для WASM buffer может содержать регион общей WebAssembly.Memory:

~~~text
WasmBuffer
├── pointer / offset
└── byteLength
~~~

Для WebGPU buffer может содержать GPU resource и параметры его использования:

~~~text
WebGpuBuffer
├── GPUBuffer
├── offset
├── size
└── backend-specific binding information
~~~

Не следует считать этот handle универсальным числом. WASM pointer и WebGPU GPUBuffer имеют разную природу.

Transformer владеет lifecycle buffer, а Algorithm получает buffer для использования в своих вычислениях.

### 33.5 Общая memory может использоваться несколькими WASM algorithms

Несколько WASM modules могут иметь отдельные WebAssembly.Instance, но использовать одну WebAssembly.Memory:

~~~text
                    WebAssembly.Memory
                           │
             ┌─────────────┼─────────────┐
             │             │             │
             ▼             ▼             ▼
       Repulsion       Graph        Z-damping
        instance       instance       instance
             │             │             │
             └─────────────┴─────────────┘
                           │
                      shared buffers
~~~

Backend отвечает за allocation внутри общей memory, чтобы ресурсы не пересекались.

Это означает, что Transformer не должен хранить один `attachedInstanceId`. Один и тот же buffer может использоваться несколькими algorithm instances.

### 33.6 Algorithm и WebAssembly.Instance

`Algorithm` и технический `WebAssembly.Instance` — не одно и то же понятие, но отдельный архитектурный класс `Instance` не вводится.

Например:

~~~text
WasmRepulsionAlgorithm
├── WebAssembly.Instance   ← implementation detail
├── PointsBuffer
└── algorithm state
~~~

То есть Algorithm является нашей архитектурной сущностью, а `WebAssembly.Instance` — внутренней деталью реализации конкретного WASM algorithm.

Для WebGPU аналогичная деталь может быть представлена compute pipeline, bind groups и другими GPU resources.

### 33.7 Mediator-driven synchronization

Целевая модель больше не требует, чтобы EnginePipeline явно выполнял generic `Load` и `Save` вызовы Transformer.

Transformer подписывается на Mediator и получает направление синхронизации через события.

Первоначальная загрузка:

~~~text
DataManager
    ↓
PointGraphManager
    ↓
Mediator: data loaded
    ↓
Transformer
    ↓
Backend Buffer
~~~

Изменение отдельной точки:

~~~text
Mediator: point changed + Point ID
    ↓
Transformer
    ↓
PointGraphManager existing index
    ↓
Backend Buffer
~~~

Transformer **не создаёт собственный ID → index Map**. Для разрешения Point ID используется существующая индексация PointGraphManager.

Обратная синхронизация после physics:

~~~text
EnginePipeline
    ↓
final completion callback
    ↓
Mediator: physics state updated
    ↓
Transformer
    ↓
Backend Buffer → PointGraphManager
~~~

Final callback является orchestration callback, а не дополнительным physics Algorithm.

### 33.8 Направления синхронизации задаются Transformer

Конкретный Transformer должен знать, на какие Mediator events он подписывается для:
- model → backend synchronization;
- backend → model synchronization;
- полной загрузки;
- частичного обновления, если оно поддерживается.

Конкретные event types могут передаваться через constructor/configuration Transformer, если это не противоречит существующей типизированной модели Mediator.

Это позволяет Transformer оставаться адаптером данных, а EnginePipeline — механизмом выполнения physics.

### 33.9 Новая граница ответственности

Целевая схема:

~~~text
PointGraphManager
       │
       ↕
     Mediator
       │
       ↕
   Transformer
       │
       ↕
 Backend Buffer
       │
       ↕
   Algorithm
       │
       ▼
Backend execution
~~~

При этом:

- PointGraphManager — domain source of truth;
- Mediator — события изменения и synchronization boundaries;
- Transformer — model ↔ backend buffer;
- Buffer — backend storage handle;
- Algorithm — physics semantics и вычисление;
- BaseBackend — низкоуровневые backend operations;
- BackendContext — lifecycle и состав конкретной backend configuration;
- EnginePipeline — порядок выполнения algorithms.

### 33.10 Что должно быть пересмотрено при реализации

Следующая реализация должна пересмотреть:
1. `EnginePipelineSynchronization.load/save`;
2. `transformer.attachInstance(...)`;
3. transformer-specific return types из `loadData()`;
4. отдельную memory на каждый WASM algorithm instance;
5. собственные Transformer ID → index maps;
6. lifecycle и unsubscribe Transformer от Mediator;
7. создание/замену BackendContext при смене backend.

Эта модель является **архитектурным направлением для следующей реализации**, а не утверждением, что все перечисленные изменения уже внесены в исходники.
