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

На текущем этапе backend-specific является только Z-damping.

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
JS Repulsion
JS Graph
WASM Z-damping
~~~

WebGPU:

~~~text
JS Repulsion
JS Graph
WebGPU Z-damping
~~~

Это промежуточная исследовательская стадия.

## 13. Будущее

После Z-damping backend implementations могут быть добавлены для Repulsion и Graph:

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

Graph требует отдельного исследования concurrent writes и accumulation.

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

WebGPU Repulsion и Graph также реализованы с async execution contract. Их подключение к текущему synchronous AnimationEngine остаётся отдельной границей AnimationEngine-async-callbacks.md.

