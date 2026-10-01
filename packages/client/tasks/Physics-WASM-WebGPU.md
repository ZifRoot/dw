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

## 2. Один логический state, два физических storage

Логически существует одно состояние physics, но у backend разные физические области памяти:

```text
PointGraphManager
       ↓
logical physics state
       ↓
┌───────────────┬────────────────┐
│               │                │
WASM backend    WebGPU backend
│               │
linear memory   GPUBuffer
│               │
physics passes  physics passes
└───────┬───────┘
        ↓
JavaScript Point[]
        ↓
D3/SVG
```

WASM `WebAssembly.Memory` и WebGPU `GPUBuffer` не следует считать одним физическим объектом памяти. Обычный browser WebGPU API не даёт архитектуры, на которую можно надёжно опереться для прямого aliasing этих областей.

Поэтому backend имеют два физических буфера, но используют единый логический physics contract.

---

## 3. Полный physics pass

Синхронизация выполняется только на границах полного pass:

```text
JavaScript Point[]
        │
        │ upload
        ▼
Physics backend state
        │
        ├── Repulsion
        ├── Graph physics
        └── Z-damping
        │
        │ download / readback
        ▼
JavaScript Point[]
        │
        ▼
D3 / SVG
```

Между отдельными physics запрещены промежуточные:

- backend → JavaScript;
- JavaScript → backend.

Таким образом, не должно быть цепочки `JS → GPU → JS → GPU → JS` между отдельными алгоритмами.

---

## 4. Явные операции синхронизации

Backend должен предоставлять концептуальные операции:

```text
upload(points)
    ↓
backend physics state
    ↓
step(...)
    ↓
download(points)
```

### Upload

Первичная загрузка переносит необходимые данные из `Point[]` в backend state. Полная повторная загрузка требуется при необходимости полной синхронизации или изменении состава данных.

### Download

Download обновляет существующие `Point` in-place.

Новый `Point[]` не создаётся. После download существующие D3/SVG сцены продолжают работать с теми же объектами.

---

## 5. Изменение одной точки

При drag не требуется повторно загружать весь массив.

Концептуально:

```text
Point[i] changed
    ↓
updatePoint(index, state)
    ↓
backend buffer
```

Это должно работать и для WASM, и для WebGPU.

---

## 6. Mapping Point → buffer index

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

---

## 7. Physics state layout

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

## 8. Physics algorithms

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

## 9. Порядок physics

Для обоих backend:

```text
Repulsion
    ↓
Graph physics
    ↓
Z-damping
```

Все три алгоритма используют одно состояние backend.

---

## 10. WebGPU

Целевой GPU backend — именно WebGPU Compute + WGSL:

```text
WebGPU
    ↓
GPUBuffer
    ↓
Compute Pipeline
    ↓
WGSL compute shaders
```

WebGL не является целевым backend.

Все physics kernels используют общий GPU state. Объединение kernels или иные dispatch-оптимизации рассматриваются после получения корректной базовой реализации и измерений.

---

## 11. WASM

WASM backend использует собственную linear memory:

```text
JS Point[]
    ↓ upload
WASM linear memory
    ↓
Repulsion
    ↓
Graph
    ↓
Z-damping
    ↓ download
JS Point[]
```

Реализация может быть выполнена, например, на Rust или C++. Выбор языка не должен менять physics contract.

---

## 12. JavaScript и D3/SVG

Пока renderer остаётся SVG/D3, WebGPU physics неизбежно требует GPU → CPU → JavaScript readback для передачи актуальных координат SVG.

Поэтому benchmark должен отделять:

- время GPU physics;
- GPU readback;
- обновление `Point[]`;
- D3/SVG update;
- полный pass/frame.

Нельзя оценивать backend только по времени compute kernels.

---

## 13. Численная точность

JavaScript `number` и backend `float32` могут давать небольшие расхождения.

До реализации необходимо определить:

- формат координат;
- допустимую абсолютную/относительную погрешность;
- правила сравнения WASM/WebGPU с reference implementation.

Побитовое совпадение не следует требовать при различающейся floating-point precision.

---

## 14. Граница ответственности

Не следует помещать знания о Rust/WASM или WebGPU непосредственно в `Point`, `EntityCollection` или domain physics models.

Желаемая граница:

```text
PointGraphManager
        │
        ├── Point[]
        │
        └── physics state / synchronization contract
                    │
             ┌──────┴──────┐
             │             │
        WASM backend   WebGPU backend
             │             │
        linear memory    GPUBuffer
             │             │
             └──────┬──────┘
                    │
                  physics
```

Конкретный API этого слоя определяется отдельно до начала реализации.

---

## 15. Что не входит в эту фиксацию

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

## 16. Ключевые инварианты

1. Один логический physics state.
2. Два физических backend storage: WASM linear memory и `GPUBuffer`.
3. Одна загрузка перед полным physics pass.
4. Все physics одного backend используют один state.
5. Одна выгрузка после полного physics pass.
6. Существующие `Point` обновляются in-place.
7. Изменение одной точки не требует полной загрузки.
8. Graph edges передаются как buffer indices, а не JS object references.
9. WASM и WebGPU сохраняют одну математическую семантику.
10. WebGPU использует WebGPU/WGSL, а не WebGL.
11. GPU readback и D3/SVG учитываются отдельно при benchmark.
12. Swap-with-last в `EntityCollection` не должен ломать point → buffer index mapping.

---

## 17. Следующий этап

До реализации необходимо отдельно определить:

1. точный physics state layout;
2. API `upload` / `download` / `updatePoint`;
3. lifecycle синхронизации при add/remove;
4. `Point.id ↔ buffer index`;
5. представление edges;
6. безопасный GPU Graph physics;
7. floating-point contract;
8. WASM ABI;
9. WebGPU buffer layout и bind groups;
10. benchmark contract.

После согласования этих решений WASM и WebGPU backend можно реализовывать независимо, сохраняя единый physics contract.
