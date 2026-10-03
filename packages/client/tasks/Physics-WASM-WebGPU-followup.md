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

index.ts не содержит source URL z-damping.cpp или z-damping.wgsl.

Source URL создаёт сам algorithm.

~~~text
WasmZDapperAlgorithm
    → z-damping.cpp

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

## 14. Главный инвариант

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
