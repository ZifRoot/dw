# Актуализация: Physics — WASM и WebGPU

Основным источником архитектурных решений является:

~~~text
packages/client/tasks/Physics-WASM-WebGPU.md
~~~

Этот документ фиксирует ключевые уточнения, которые нельзя потерять при дальнейшей реализации.

## 1. Один EnginePipeline

Не создавать отдельные JsPhysicsPipeline, WasmPhysicsPipeline или WebGpuPhysicsPipeline.

Используется один существующий EnginePipeline.

Backend selection меняет configuration этого pipeline:

~~~text
EnginePipeline
    ├── Repulsion
    ├── Graph
    └── Z-damping
~~~

На текущем этапе backend-specific реализации существуют для Repulsion, Graph и Z-damping. Default configuration остаётся JavaScript, а WASM/WebGPU configurations используют соответствующие backend algorithms.

## 2. Pipeline создаётся один раз

Правильная схема:

~~~text
new EnginePipeline(...)
        ↓
try backend
        ↓
pipeline.setConfiguration(...)
~~~

Fallback не создаёт новый pipeline.

## 3. Configurations создаются один раз

В composition root создаётся один набор:

~~~text
RepulsionEngineConfig
GraphEngineConfig
ZDampingConfig
~~~

Даже если backend использует только Z-damping, connector получает все три configurations.

Это единая точка будущих настроек и расширения.

## 4. Source принадлежит algorithm

index.ts не содержит source URL z-damping.wasm или z-damping.wgsl.

Source URL создаёт сам algorithm.

~~~text
WasmZDapperAlgorithm
    → z-damping.wasm
    → generated from z-damping.cpp

WebGpuZDapperAlgorithm
    → z-damping.wgsl
~~~

Composition root знает algorithm, но не его внутренний source layout.

## 5. Generic backend

WasmBackend и WebGpuBackend являются runtime/resource layers.

Они не должны знать:
- PointGraphManager;
- Z-damping;
- Repulsion;
- Graph;
- physics semantics.

Они предоставляют runtime, resources, memory/buffers, execution, read/write и lifecycle.

## 6. Transformer владеет point storage

Transformer связывает:

~~~text
PointGraphManager
      ↕
backend point storage
~~~

Для WASM это linear memory, для WebGPU — GPUBuffer.

Transformer поддерживает:
- load();
- save();
- loadPoint(index);
- savePoint(index).

save() не получает внешний readback buffer: transformer знает собственный storage/readback state.

## 7. Общий point layout

~~~text
float32 x
float32 y
float32 z
int32   fixed
~~~

Размер — 16 bytes.

fixed намеренно является int32 для сохранения layout и возможности будущих bit flags.

## 8. WASM

Source:

~~~text
packages/client/src/physics/wasm/z-damping.cpp
~~~

Runtime module:

~~~text
packages/client/src/physics/wasm/z-damping.wasm
~~~

The `.wasm` module is generated and ignored by Git. `packages/client/scripts/build-wasm.mjs` reuses it when present and compiles it with `clang++ --target=wasm32` when absent.

Export:

~~~text
z_damping
~~~

Runtime:

~~~text
fetch .wasm
    ↓
WebAssembly.instantiate
    ↓
instance
    ↓
exported function
~~~

Каждый algorithm instance имеет собственную WASM memory.

## 9. WebGPU

Source:

~~~text
packages/client/src/physics/webgpu/z-damping.wgsl
~~~

Entry points:

~~~text
updatePoints
reduceTemperature
~~~

Temperature вычисляется двумя passes.

Текущий prototype рассчитан максимум на:

~~~text
256 workgroups × 256 points = 65 536 points
~~~

Это ограничение текущего reduction prototype.

## 10. WebGPU async boundary

Реальный GPU step находится в executeAsyncStep(): Promise<number>.

Текущий synchronous BaseAlgorithm не блокирует ожидание GPU.

Для подключения WebGPU к animation loop требуется отдельная generic задача:

~~~text
packages/client/tasks/AnimationEngine-async-callbacks.md
~~~

AnimationEngine не должен знать о backend.

## 11. Fallback

Текущая composition logic:

~~~text
WebGPU
  ↓ failure
WASM
  ↓ failure
default JS
~~~

Во всех случаях используется один EnginePipeline.

Порядок является свойством текущего index.ts и может быть изменён в composition root без изменения архитектуры pipeline.

## 12. Текущие configurations

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

Это текущие experimental configurations; все они используют один EnginePipeline.

## 13. Будущее

Backend implementations для Repulsion и Graph уже добавлены:

~~~text
WASM:
  Repulsion
  Graph
  Z-damping

WebGPU:
  Repulsion
  Graph
  Z-damping
~~~

При этом EnginePipeline остаётся тем же.

Graph baseline использует ownership одной output point на invocation и не требует concurrent writes в одну координату.

## 14. Synchronization steps

Синхронизация не должна выполняться после каждого algorithm.

Предпочтительная структура pipeline:

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

`Load` передаёт domain state в backend storage один раз. Algorithms последовательно используют тот же storage. `Save` возвращает итоговое состояние в `PointGraphManager`.

Это особенно важно для WebGPU: промежуточные `GPU → CPU → GPU` transfers между algorithms должны избегаться, если algorithms могут работать на одном `GPUBuffer`.

Для WASM действует тот же принцип с общей `WebAssembly.Memory`.

Algorithm отвечает за вычисление, а pipeline — за границы synchronization. Transformer реализует саму передачу данных, но не решает, где в pipeline должны находиться Load/Save.

## 15. Главный инвариант

Backend меняет способ выполнения algorithm, но не меняет:

- domain source of truth;
- логический порядок physics;
- configuration model;
- EnginePipeline;
- renderer model.

~~~text
PointGraphManager
       │
       ▼
EnginePipeline
       │
       ├── Repulsion
       ├── Graph
       └── Z-damping
              │
       ┌──────┴──────┐
       │             │
      JS            Backend
                    │
              ┌─────┴─────┐
              │           │
             WASM       WebGPU
~~~

Этот инвариант должен сохраняться при последующем расширении physics backend.


## 16. Реализация Repulsion и Graph

Backend implementations для оставшихся двух algorithms добавлены для обоих исследовательских backend.

WASM:

~~~text
WasmRepulsionAlgorithm
    → repulsion.wasm
    → repulsion.cpp

WasmGraphAlgorithm
    → graph.wasm
    → graph.cpp
~~~

WebGPU:

~~~text
WebGpuRepulsionAlgorithm
    → repulsion.wgsl

WebGpuGraphAlgorithm
    → graph.wgsl
~~~

Оба backend используют тот же point layout:

~~~text
x: float32
y: float32
z: float32
fixed: int32
~~~

### WASM shared memory

Repulsion, Graph и Z-damping создаются из отдельных WASM modules, но получают одну WebAssembly.Memory.

~~~text
                WebAssembly.Memory
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
    Repulsion        Graph        Z-damping
     module          module          module
        │              │              │
        └──────────────┴──────────────┘
                       │
                 Point storage
~~~

Поэтому переход между algorithms не требует копирования point state.

Allocator backend также является общим для modules, использующих одну memory, чтобы разные instances не выделяли пересекающиеся области.

### WebGPU shared point storage

WebGPU Repulsion и Graph используют один WebGpuPointsTransformer.

Алгоритм пишет результат в transformer-owned scratch buffer, после чего backend копирует результат обратно в основной point buffer.

~~~text
GPU point buffer
      ↓
compute algorithm
      ↓
GPU scratch buffer
      ↓
same GPU point buffer
~~~

Это позволяет нескольким algorithms работать последовательно с одним backend point storage без CPU readback между ними.

### Graph concurrency

WebGPU Graph не использует конкурентную запись нескольких invocations непосредственно в одну точку.

Каждая invocation владеет ровно одной выходной точкой и читает исходные points/edges:

~~~text
point i
  ↓
scan relevant edges
  ↓
output point i
~~~

Это избегает race condition на координатах.

Текущий исследовательский вариант использует полный scan массива edges для каждой point. Это намеренно простая корректная GPU baseline; оптимизация adjacency representation является отдельным исследованием.

### Repulsion execution model

WebGPU Repulsion использует один invocation на point. Invocation читает исходный point buffer, вычисляет displacement относительно остальных points и записывает только свою output point.

Это не является буквальным переносом последовательного JavaScript pair loop: GPU вариант использует независимый snapshot состояния текущего шага, что позволяет избежать конкурентных записей.

### Temperature reduction

Repulsion и Graph используют тот же двухпроходный принцип reduction, что и Z-damping:

~~~text
algorithm pass
    ↓
workgroup maxima
    ↓
reduction pass
    ↓
temperature[0]
~~~

Ограничение текущего prototype: 256 workgroups × 256 invocations = 65 536 points.

### Synchronization

Для WASM pipeline теперь есть отдельные generic Load/Save boundaries в EnginePipeline.

~~~text
Load
  ↓
WASM Repulsion
  ↓
WASM Graph
  ↓
WASM Z-damping
  ↓
Save
~~~

Алгоритмы не выполняют промежуточный save.

WebGPU Repulsion, Graph и Z-damping подключены к общему async contract AnimationEngine. Pipeline ожидает завершение каждого backend step перед переходом к следующему algorithm, а финальный Save ожидается перед завершением physics run.


## 18. Исправления после CI

После реализации Repulsion и Graph CI выявил три технических класса ошибок:

1. В нескольких исходниках были записаны текстовые последовательности \\n вместо реальных переводов строк. Это приводило к TS1127 при typecheck.
2. Условно сформированный объект imports для WebAssembly.instantiate() требовал явной типизации как WebAssembly.Imports, чтобы корректно поддерживать переданную shared WebAssembly.Memory.
3. WebGPU algorithms наследовали синхронный abstract applyStep() из BaseAlgorithm. Для сохранения общего synchronous contract методы реализованы явно, но намеренно бросают ошибку; фактическое выполнение WebGPU идёт через applyStepAsync().

После этих исправлений CI успешно прошёл, а PR #54 был смержен в dev.


## 17. Целевая модель BackendContext и buffers

Этот раздел фиксирует новую архитектурную модель. Предыдущие разделы сохраняются как описание уже реализованного prototype. В частности, старое описание отдельной memory на каждый algorithm instance и `attachInstance()` больше не является целевой архитектурой.

### 17.1 BaseBackend

Низкоуровневый класс backend следует рассматривать как `BaseBackend`.

~~~text
BaseBackend
    ├── WasmBackend
    └── WebGpuBackend
~~~

BaseBackend предоставляет только технологические операции:
- allocation;
- memory/buffer access;
- module/instance creation;
- execution;
- read/write;
- resource destruction.

BaseBackend не знает PointGraphManager, Transformer, Mediator или physics semantics.

### 17.2 BackendContext

`BackendContext` — отдельное lifecycle-окружение конкретной backend configuration:

~~~text
BackendContext
├── BaseBackend
├── Transformers[]
├── Algorithms[]
└── EnginePipeline
~~~

Transformer и Algorithm не являются частью BaseBackend. Они входят в один Context.

При смене backend старый Context должен быть уничтожен целиком:

~~~text
Algorithms.dispose()
    ↓
Transformers.dispose()
    ↓
BaseBackend.dispose()
    ↓
new BackendContext(...)
~~~

Transformer при dispose обязан отписаться от Mediator. Иначе старый backend может продолжить реагировать на domain events после переключения на новый backend.

### 17.3 Transformer как владелец backend buffer

Transformer является адаптером domain model к backend storage:

~~~text
PointGraphManager
       ↕
Transformer
       ↕
Backend Buffer
~~~

Transformer хранит buffer/resource и предоставляет его алгоритмам через `getBuffer()`.

Один Transformer может быть использован несколькими Algorithms:

~~~text
PointsTransformer
    ├── Repulsion
    ├── Graph
    └── Z-damping
~~~

Один Algorithm может использовать несколько Transformers:

~~~text
Graph
    ├── PointsTransformer
    └── EdgesTransformer
~~~

Связь Transformers ↔ Algorithms является many-to-many.

### 17.4 Backend Buffer

Buffer является backend-specific handle.

WASM:

~~~text
WasmBuffer
├── pointer / offset
└── byteLength
~~~

WebGPU:

~~~text
WebGpuBuffer
├── GPUBuffer
├── offset
├── size
└── backend-specific binding information
~~~

Не следует делать универсальный numeric buffer ID, если backend semantics требуют более богатого handle.

Algorithm получает Buffer и связывает его со своим backend execution. Transformer остаётся владельцем lifecycle ресурса.

### 17.5 Shared WASM memory

Несколько WASM algorithms могут иметь разные `WebAssembly.Instance`, но использовать одну `WebAssembly.Memory`:

~~~text
                    WebAssembly.Memory
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
        Repulsion       Graph       Z-damping
         instance       instance       instance
             │             │             │
             └─────────────┴─────────────┘
                           │
                      shared buffers
~~~

Backend allocator должен предотвращать пересечение областей memory.

Transformer не должен хранить один `attachedInstanceId`: один buffer не принадлежит одному algorithm instance.

### 17.6 Algorithm и Instance

Отдельный архитектурный класс `Instance` не вводится.

`WebAssembly.Instance` остаётся implementation detail конкретного WASM Algorithm:

~~~text
WasmRepulsionAlgorithm
├── WebAssembly.Instance
├── PointsBuffer
└── algorithm state
~~~

Для WebGPU соответствующие execution resources также являются деталями Algorithm/Backend implementation.

Таким образом, архитектурная ось — **Algorithms и Transformers**, а не Algorithms и отдельные Instance objects.

### 17.7 Mediator-driven synchronization

Целевая synchronization model:

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

Для отдельного изменения:

~~~text
Mediator: point changed + Point ID
    ↓
Transformer
    ↓
PointGraphManager existing index
    ↓
Backend Buffer
~~~

Transformer не создаёт дополнительный ID → index Map. Используется существующая индексация PointGraphManager.

После physics:

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

Final completion callback не является Algorithm.

### 17.8 Load/Save pipeline как prototype boundary

Существующие generic Load/Save steps должны рассматриваться как текущий prototype synchronization mechanism.

Целевая модель заменяет их Mediator-driven synchronization:

~~~text
old prototype:
Load → Algorithms → Save

target:
Mediator events → Transformers
                    ↑
             Algorithms/Pipeline
~~~

При этом не требуется промежуточный CPU readback/upload между algorithms одного backend.

Следующая реализация должна удалить зависимость EnginePipeline от `EnginePipelineSynchronization.load/save`, если текущий Mediator API позволяет корректно выразить эти synchronization boundaries.

### 17.9 Главный lifecycle invariant

В рамках одного BackendContext:

~~~text
one BaseBackend
      +
many Transformers
      +
many Algorithms
      +
one EnginePipeline
~~~

Все они образуют одну конфигурацию и уничтожаются совместно.

BaseBackend остаётся технологическим механизмом. BackendContext является владельцем lifecycle всей конфигурации.
