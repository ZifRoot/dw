# Продолжение: Physics — WASM и WebGPU

## Назначение

Этот документ **не заменяет** `Physics-WASM-WebGPU.md`.

Предыдущий документ сохранён как историческая архитектурная фиксация. Этот файл содержит только последующие уточнения, сделанные после его подготовки.

При реализации задачи необходимо учитывать оба документа:

1. `Physics-WASM-WebGPU.md` — предыдущая фиксация;
2. этот документ — последующие уточнения и исправления архитектурной модели.

Цель этого продолжения — не переписывать уже зафиксированное, а уточнить те места, которые были поняты слишком конкретно до проведения практических экспериментов.

---

## 1. Ключевое исправление: EnginePipeline не заменяется backend-specific pipeline

Не следует вводить отдельные классы:

```text
JsPhysicsPipeline
WasmPhysicsPipeline
WebGpuPhysicsPipeline
```

Также не следует переименовывать или специализировать существующий `EnginePipeline`.

Существующий:

```text
packages/client/src/core/Engines/EnginePipeline.ts
```

остаётся общей архитектурной абстракцией.

`EnginePipeline` уже умеет хранить последовательность `BaseAlgorithm`, управлять включённостью алгоритмов, запускать их через существующий `AnimationEngine` и соблюдать заданный порядок.

Поэтому backend не должен менять саму сущность `EnginePipeline`.

---

## 2. Три экземпляра одного EnginePipeline

Исследуемая архитектура допускает несколько экземпляров **одного и того же класса** `EnginePipeline`.

Концептуально:

```text
EnginePipeline #1
    ├── JS Repulsion
    ├── JS Graph
    └── JS Z-damping

EnginePipeline #2
    ├── WASM Repulsion
    ├── WASM Graph
    └── WASM Z-damping

EnginePipeline #3
    ├── WebGPU Repulsion
    ├── WebGPU Graph
    └── WebGPU Z-damping
```

Все три pipeline имеют одинаковую логическую структуру:

```text
Repulsion
    ↓
Graph
    ↓
Z-damping
```

Различается только конкретная реализация `BaseAlgorithm`.

Таким образом:

> `EnginePipeline` отвечает за orchestration и порядок алгоритмов, а не за технологию, внутри которой алгоритм выполняет вычисления.

Это позволяет сохранить существующую архитектуру `AnimationEngine → EnginePipeline → BaseAlgorithm` без введения трёх разных pipeline-классов.

---

## 3. Backend holder / engine не является pipeline

`WasmPhysicsMemory` и `WebGpuPhysicsMemory` следует рассматривать как backend-specific engine/resource holders.

Они нужны для:

- проверки доступности технологии;
- инициализации runtime;
- создания backend resources;
- выделения backend memory;
- хранения backend state;
- предоставления execution facilities конкретным algorithms;
- освобождения backend resources.

При этом holder не должен повторять ответственность `EnginePipeline`.

Концептуально:

```text
AnimationEngine
       │
       ▼
EnginePipeline
       │
       ├── Algorithm
       ├── Algorithm
       └── Algorithm
              │
              ▼
       backend engine/memory
              │
       ┌──────┴──────┐
       │             │
      WASM         WebGPU
```

Для конкретного backend каждый algorithm получает совместимый backend engine/memory object.

Например:

```text
WasmRepulsionAlgorithm  → WasmPhysicsMemory
WasmGraphAlgorithm      → WasmPhysicsMemory
WasmZDampingAlgorithm   → WasmPhysicsMemory

WebGpuRepulsionAlgorithm → WebGpuPhysicsMemory
WebGpuGraphAlgorithm     → WebGpuPhysicsMemory
WebGpuZDampingAlgorithm  → WebGpuPhysicsMemory
```

Названия классов пока считаются рабочими. Их окончательная ответственность должна быть проверена на прототипе.

---

## 4. EnginePipeline не обязан знать, где выполняется алгоритм

С точки зрения `EnginePipeline` backend-specific algorithm остаётся обычным `BaseAlgorithm`.

Условно:

```text
EnginePipeline
    │
    ├── BaseAlgorithm.step(deltaTime)
    ├── BaseAlgorithm.step(deltaTime)
    └── BaseAlgorithm.step(deltaTime)
```

Внутри конкретного алгоритма может происходить:

```text
WASM algorithm
    ↓
WasmPhysicsMemory
    ↓
WASM function
```

или:

```text
WebGPU algorithm
    ↓
WebGpuPhysicsMemory
    ↓
GPU command encoding
    ↓
compute dispatch
```

Поэтому `EnginePipeline` не должен содержать условную логику вида `if backend === wasm` / `if backend === webgpu`.

Backend-specific execution остаётся внутри соответствующих algorithm/engine объектов.

---

## 5. Пока нельзя окончательно фиксировать структуру WASM/WebGPU execution

До практического эксперимента не следует жёстко фиксировать:

- один kernel или несколько;
- один shader module или несколько;
- один WASM module или несколько;
- отдельную компиляцию каждого algorithm;
- объединение исходников всех algorithms;
- окончательный ABI;
- окончательный формат передачи данных.

Причина проста: эти решения зависят от реального механизма выполнения конкретной технологии.

Поэтому сначала требуется минимальный Hello World prototype.

---

## 6. WebGPU: что именно является исполняемым объектом

Для WebGPU естественная цепочка выглядит примерно так:

```text
WGSL source string
      ↓
GPUShaderModule
      ↓
GPUComputePipeline
      ↓
bind group / resources
      ↓
command encoder
      ↓
compute pass
      ↓
dispatchWorkgroups()
```

То есть WGSL source действительно может существовать как строка в JavaScript/TypeScript, после чего браузер создаёт из неё `GPUShaderModule`.

Минимальный эксперимент должен показать полный жизненный цикл:

1. проверить наличие WebGPU;
2. получить `GPUAdapter`;
3. получить `GPUDevice`;
4. создать `GPUBuffer`;
5. создать shader module из WGSL;
6. создать compute pipeline;
7. создать bind group;
8. записать commands;
9. выполнить `dispatchWorkgroups()`;
10. получить результат через readback buffer;
11. прочитать результат в JavaScript.

До такого эксперимента не следует решать, будут ли три physics algorithms тремя отдельными kernels, одним shader module с тремя entry points или одной более крупной compute-программой.

---

## 7. WASM: source code и runtime module — разные вещи

Для WASM необходимо отдельно различать **исходный код** и **исполняемый module**.

В отличие от WGSL, браузерный `WebAssembly.instantiate()` не принимает произвольную строку C++ или Rust как готовую исполняемую программу.

Типичная цепочка выглядит так:

```text
C++ / Rust / WAT
      ↓
compile
      ↓
.wasm module
      ↓
WebAssembly.instantiate()
      ↓
WebAssembly.Instance
      ↓
exported function
```

Поэтому идея:

```text
algorithm source string
        ↓
execute(source)
```

не должна пока считаться реальным WASM runtime API.

Если потребуется компиляция исходников непосредственно в браузере, это будет отдельной задачей и отдельной зависимостью. Для первого эксперимента это не требуется.

---

## 8. Минимальный WASM Hello World

Первый WASM prototype должен быть максимально маленьким, но уже похожим на physics workload.

Рекомендуемый вариант:

```text
Input:
[1, 2, 3, 4]

WASM:
multiply every element by 2

Output:
[2, 4, 6, 8]
```

Это позволяет проверить:

- выделение linear memory;
- передачу массива;
- чтение массива внутри WASM;
- изменение массива;
- возврат результата;
- соответствие layout между JavaScript и WASM.

После этого можно заменить операцию умножения на реальный минимальный physics operation.

---

## 9. Минимальный WebGPU Hello World

WebGPU prototype должен выполнять ту же операцию:

```text
Input:
[1, 2, 3, 4]

GPU compute:
multiply every element by 2

Output:
[2, 4, 6, 8]
```

Это позволит сравнить две технологии на одинаковой задаче и отдельно увидеть:

- создание resources;
- upload;
- compute dispatch;
- GPU execution;
- readback;
- synchronization.

Одинаковая операция важнее сложности первого prototype: цель эксперимента — понять execution model, а не получить производительный physics engine.

---

## 10. Первый реальный physics prototype — Z-damping

После Hello World целесообразно реализовать не Repulsion и не Graph physics, а максимально простой реальный physics pass — Z-damping.

Причины:

- операция независима для отдельных точек;
- отсутствуют связи между точками;
- нет `O(N²)`;
- нет сложностей с edge accumulation;
- проще сравнить JS/WASM/WebGPU;
- проще проверить передачу и обновление physics state.

Концептуально:

```text
z = z * damping
```

Все backend должны получить одинаковый входной state и применить одну математическую операцию.

После этого уже можно переходить к Repulsion и Graph physics.

---

## 11. Почему Repulsion не должен быть первым экспериментом

Repulsion имеет порядок сложности `O(N²)`.

Если начать исследование непосредственно с него, одновременно появятся несколько независимых вопросов:

- правильность backend memory layout;
- upload/readback;
- dispatch;
- floating-point differences;
- параллелизм;
- производительность;
- размер workgroups;
- структура algorithm;
- сравнение с JavaScript.

Это затруднит понимание результата эксперимента.

Сначала необходимо доказать корректность минимальной execution model, затем переносить более сложные physics algorithms.

---

## 12. Graph physics особенно нельзя фиксировать до эксперимента

Graph physics требует обработки edge relationships и изменения координат связанных точек.

Для GPU потенциально возникает проблема конкурентной записи:

```text
edge A → point X
edge B → point X
```

Если разные GPU invocations одновременно изменяют одну и ту же точку, возникает race condition.

Поэтому окончательная GPU структура Graph physics должна быть определена после понимания базового execution model и анализа безопасного способа accumulation.

Нельзя просто перенести текущий JavaScript цикл в WGSL и считать задачу решённой.

---

## 13. Возможные варианты организации algorithms

После прототипа должны быть исследованы как минимум следующие варианты.

### WebGPU

**Вариант A — отдельные kernels**

```text
Repulsion kernel
Graph kernel
Z-damping kernel
```

Плюсы:

- простая изоляция;
- очевидное соответствие algorithms;
- независимый dispatch.

Минусы:

- дополнительные dispatch;
- потенциальные ограничения по промежуточному состоянию.

**Вариант B — один shader module с несколькими entry points**

```text
GPUShaderModule
    ├── repulsion()
    ├── graph()
    └── zDamping()
```

Это позволяет хранить связанные kernels в одном shader module, но не означает, что они автоматически выполняются одним dispatch.

**Вариант C — объединённый kernel**

Несколько операций выполняются внутри одного compute dispatch.

Плюсы и минусы этого варианта нельзя определить только архитектурно; требуется измерение и проверка корректности.

### WASM

Аналогично следует проверить:

- один module с несколькими exported functions;
- несколько modules;
- общий state в одной linear memory;
- отдельные compiled units;
- объединение исходников.

На первом этапе ни один из этих вариантов не фиксируется как окончательный.

---

## 14. Общий критерий выбора структуры

После prototype структура должна оцениваться не только по удобству кода.

Нужно учитывать:

1. корректность;
2. простоту передачи physics state;
3. количество upload/readback;
4. количество dispatch;
5. стоимость синхронизации;
6. reuse общего state;
7. размер и lifecycle compiled module;
8. возможность независимого тестирования algorithms;
9. соответствие существующему `EnginePipeline`;
10. измеряемую производительность.

Главный принцип:

> Сначала подтвердить execution model экспериментом, затем фиксировать оптимизированную структуру.

---

## 15. Что меняется в предыдущей архитектурной модели

Предыдущий документ содержит описание backend holder как объекта, который сам содержит порядок:

```text
Repulsion
    ↓
Graph
    ↓
Z-damping
```

Это описание теперь следует понимать осторожнее.

**Порядок physics остаётся обязательным**, но orchestration этого порядка принадлежит существующему `EnginePipeline`, а не отдельному backend pipeline внутри `WasmPhysicsMemory` или `WebGpuPhysicsMemory`.

Актуальная модель:

```text
EnginePipeline
    │
    ├── backend-specific RepulsionAlgorithm
    ├── backend-specific GraphAlgorithm
    └── backend-specific ZDampingAlgorithm
              │
              ▼
      backend engine/memory
```

Holder предоставляет backend resources и execution facilities, но не дублирует `EnginePipeline`.

Это уточнение не требует удаления предыдущего документа: оно является более поздней трактовкой архитектуры.

---

## 16. Что должно быть проверено экспериментом

Перед окончательной реализацией необходимо получить ответы как минимум на следующие вопросы.

### WASM

- как именно собирается минимальный module в текущем проекте;
- какой runtime API используется из TypeScript;
- как передаётся `Float32Array`;
- где находится linear memory;
- как вызывается exported function;
- как устроить общий state для нескольких algorithms;
- сколько compiled units имеет смысл использовать.

### WebGPU

- как создаётся shader module;
- как задаются entry points;
- как создаются compute pipelines;
- как передаётся storage buffer;
- как выполняется dispatch;
- как читается результат;
- как организовать общий state для нескольких algorithms;
- что практически удобнее: несколько kernels, один module или объединённый dispatch.

### Обе технологии

- как сопоставить backend memory с текущим `PointGraphManager`;
- как выполнять in-place обновление существующих `Point`;
- как избежать лишнего upload/readback;
- как измерять стоимость synchronization;
- как обеспечить одинаковую математическую семантику.

---

## 17. Порядок дальнейшей работы

Рекомендуемый порядок:

```text
1. WASM Hello World
       ↓
2. WebGPU Hello World
       ↓
3. одинаковый Float32Array transform
       ↓
4. Z-damping
       ↓
5. анализ execution model
       ↓
6. окончательное решение по module/kernel structure
       ↓
7. Repulsion
       ↓
8. Graph physics
       ↓
9. benchmark
```

На шагах 1–3 цель — понять технологию.

На шаге 4 появляется первый настоящий physics algorithm.

Только после этого следует окончательно фиксировать архитектуру backend algorithms.

---

## 18. Инварианты, которые остаются действующими

Несмотря на уточнение, следующие решения предыдущего документа сохраняются:

1. `PointGraphManager` остаётся domain source of truth.
2. WASM и WebGPU используют собственные physical storage.
3. Backend получает `PointGraphManager`.
4. Existing `Point` objects обновляются in-place.
5. `Point.id ↔ buffer index` требует явного mapping.
6. Swap-with-last должен учитываться.
7. WASM и WebGPU должны реализовать одну математическую семантику physics.
8. WebGPU использует WebGPU Compute + WGSL.
9. Один active physics implementation за один execution cycle.
10. Неактивный backend не выполняет physics и не пишет результат в `PointGraphManager`.
11. UI не создаёт backend resources.
12. `Index` остаётся composition root.
13. Backend creation и activation остаются разными операциями.
14. Между algorithms одного physics pass не должно быть ненужного JS readback/upload.
15. Benchmark должен учитывать не только compute, но и synchronization/readback/render update.

---

## 19. Новая граница этой фиксации

Этот документ **не требует немедленной реализации полного physics backend**.

Сначала требуется небольшой экспериментальный слой, который позволит проверить реальные API и execution model WASM/WebGPU.

После получения результатов prototype этот документ можно дополнить новой отдельной фиксацией.

При этом предыдущий документ продолжает храниться без удаления и остаётся частью истории решений.
