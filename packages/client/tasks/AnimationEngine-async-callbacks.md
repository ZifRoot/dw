# Поддержка асинхронных AnimationCallback в AnimationEngine

## 1. Цель

Добавить в `AnimationEngine` возможность выполнять callback, который возвращает `Promise`, и корректно ждать его завершения перед продолжением выполнения соответствующей группы.

Требование возникло из-за physics backend, использующего WebGPU.

WebGPU compute выполняется асинхронно относительно JavaScript. После отправки GPU команд необходимо дождаться readback результата перед тем, как следующий physics algorithm начнёт работать с тем же состоянием точек.

Текущий `AnimationEngine` рассчитан на синхронный контракт:

```ts
export type AnimationCallback = (deltaTime: number) => void;
```

Поэтому текущий physics prototype намеренно не изменяет `AnimationEngine` и `EnginePipeline`. Поддержка async должна быть реализована владельцем animation engine.

---

## 2. Требуемый результат

AnimationEngine должен поддерживать оба варианта callback:

```text
synchronous callback
    ↓
returns immediately

asynchronous callback
    ↓
returns Promise
    ↓
AnimationEngine waits for completion
    ↓
group becomes eligible for next execution
```

Существующий синхронный код не должен требовать изменений.

Концептуальный контракт:

```ts
type AnimationCallback =
  (deltaTime: number) => void | Promise<void>;
```

Точный API может отличаться от этого предложения.

---

## 3. Главный инвариант

Для одной группы callback не допускается одновременное выполнение двух экземпляров одного callback.

Если callback:

```ts
async (deltaTime) => {
  await gpuReadback();
}
```

начал выполнение на кадре N, следующий запуск этой же группы разрешён только после завершения `await gpuReadback()`.

Нельзя получить:

```text
frame N:
    callback #1 ────────────────┐
                                │ await
frame N+1:                      ├── callback #2
                                │
                                └── callback #1 continues
```

Нужна последовательность:

```text
callback #1
    ↓
await
    ↓
completed
    ↓
callback #2
```

---

## 4. Последовательность callback внутри Pipeline

Для physics Pipeline важен следующий порядок:

```text
Algorithm #1
    │
    │ await
    ▼
completed
    │
    ▼
Algorithm #2
    │
    │ await
    ▼
completed
    │
    ▼
Algorithm #3
```

Следующий algorithm не должен стартовать только потому, что GPU command был отправлен.

Он должен стартовать после завершения операции, от которой зависит состояние `PointGraphManager`.

Это особенно важно для схемы:

```text
PointGraphManager
      ↓ upload
WebGPU
      ↓ compute
GPU buffer
      ↓ readback
PointGraphManager
      ↓
next algorithm
```

---

## 5. Frame budget

Текущий AnimationEngine использует вычислительный budget кадра и конкуренцию между callback groups.

При добавлении async callback необходимо явно определить семантику budget.

Предлагается:

1. synchronous callback учитывает фактическое время своего выполнения;
2. asynchronous callback учитывает CPU-время до первого `await` как часть текущего шага;
3. ожидание Promise не должно приводить к запуску той же группы повторно;
4. пока async callback ожидается, другие независимые группы могут продолжать конкурировать за последующие кадры;
5. завершившаяся async группа снова становится доступной для планировщика.

Важно: GPU wait не должен блокировать весь animation loop.

---

## 6. Async callback не должен блокировать другие группы

Пример:

```text
Group A
    async GPU physics
    │
    └── waiting for GPU/readback

Group B
    synchronous UI/physics callback
```

Ожидание Group A не должно блокировать выполнение Group B.

То есть нужен статус группы примерно такого вида:

```text
pending
started
waiting
completed
```

Точное внутреннее представление остаётся ответственностью AnimationEngine.

---

## 7. DeltaTime

Для async callback необходимо определить момент, относительно которого рассчитывается `deltaTime`.

Для physics предпочтительно:

```text
deltaTime =
time since previous completed execution of this group
```

а не время с момента постановки Promise в очередь.

Это предотвращает неконтролируемое накопление времени ожидания GPU как физического времени.

Однако окончательное правило должно быть согласовано с существующей моделью AnimationEngine.

---

## 8. Ошибки Promise

Ошибка async callback должна обрабатываться аналогично ошибке синхронного callback:

```ts
try {
  await callback(deltaTime);
}
catch (error) {
  // existing AnimationEngine error handling
}
```

Необработанный rejected Promise не должен становиться глобальной unhandled rejection.

После ошибки необходимо определить состояние группы:

- удалить группу;
- остановить только эту группу;
- либо передать ошибку владельцу.

Для physics наиболее полезно иметь возможность остановить ошибочную группу, не ломая остальные группы AnimationEngine.

---

## 9. Stop / remove во время await

Необходимо безопасно обработать ситуацию:

```text
callback started
    ↓
await
    ↓
group removed / engine stopped
    ↓
Promise resolves
```

После завершения Promise удалённая группа не должна:

- повторно ставиться в очередь;
- запускаться ещё раз;
- изменять состояние остановленного AnimationEngine;
- публиковать результаты как новый animation step.

Это требует проверки актуальности group registration после `await`.

---

## 10. Restart / reset

Текущая модель AnimationEngine поддерживает повторяемые Sequence и `reset()`.

Async execution не должен нарушать этот контракт.

Если sequence закончилась во время async шага, reset должен происходить только после завершения текущего callback.

Нельзя запускать следующий проход sequence параллельно с ещё выполняющимся Promise предыдущего прохода.

---

## 11. Backward compatibility

Изменение должно сохранить существующие возможности:

- синхронные callback;
- `addCallback()`;
- `addCallbacks()`;
- Generator;
- GeneratorFactory;
- повторяемые Sequence;
- `oneShot`;
- удаление callback/group;
- текущий frame budget;
- calibration;
- текущую конкуренцию callback groups.

Существующий synchronous physics code не должен становиться асинхронным только из-за нового API.

---

## 12. Требование к EnginePipeline

После появления async поддержки AnimationEngine отдельный Pipeline сможет последовательно ожидать algorithms:

```text
Pipeline callback
    │
    ├── await Algorithm #1
    ├── await Algorithm #2
    └── await Algorithm #3
```

Это должно быть реализовано владельцем `EnginePipeline` после изменения AnimationEngine.

В текущем physics prototype `EnginePipeline` намеренно остаётся синхронным.

---

## 13. WebGPU use case

Причина запроса — WebGPU Z-damping.

Один physics step имеет логическую последовательность:

```text
transformer.load()
        ↓
submit compute commands
        ↓
GPU executes
        ↓
readback points
        ↓
PointGraphManager updated
        ↓
step completed
```

Следующий algorithm должен видеть уже обновлённые точки.

Для этого завершение Promise должно означать:

```text
GPU result is available
+
PointGraphManager contains the result
```

Только после этого Pipeline может продолжать последовательность.

---

## 14. Что не нужно менять в AnimationEngine

Не требуется:

- переносить physics algorithms в AnimationEngine;
- добавлять знания о WebGPU;
- добавлять знания о WASM;
- добавлять знания о PointGraphManager;
- добавлять специальные методы для Z-damping;
- добавлять backend-specific synchronization.

AnimationEngine должен предоставлять только общий механизм планирования async callback.

---

## 15. Acceptance criteria

### AC-1 — sync callback

Существующий callback:

```ts
(deltaTime) => {
  update();
}
```

работает без изменения поведения.

### AC-2 — async callback

Callback:

```ts
async (deltaTime) => {
  await delay();
}
```

не запускается повторно до завершения Promise.

### AC-3 — independent groups

Ожидание async callback одной группы не блокирует независимую группу.

### AC-4 — sequential pipeline

Последовательность async callbacks сохраняет порядок:

```text
A start
A complete
B start
B complete
C start
C complete
```

### AC-5 — error handling

Rejected Promise не создаёт unhandled rejection.

### AC-6 — removal

Удаление группы во время `await` не приводит к её повторной регистрации после завершения Promise.

### AC-7 — stop

Остановка AnimationEngine во время `await` не приводит к запуску новых callback после завершения Promise.

### AC-8 — existing scheduling

Текущие calibration, frame budget и sequence semantics продолжают работать для synchronous callback.

---

## 16. Граница ответственности

```text
AnimationEngine
    │
    │ scheduling / frame budget / lifecycle
    ▼
EnginePipeline
    │
    │ order of algorithms
    ▼
BaseAlgorithm
    │
    │ physics step
    ▼
Transformer / Backend
    │
    └── async GPU/WASM operations
```

AnimationEngine не должен знать, почему callback является asynchronous.

Его задача — корректно планировать callback, который может завершиться немедленно или позже.

---

## 17. Следующий шаг

Разработчику AnimationEngine необходимо сначала реализовать и согласовать общий async callback contract.

После этого можно отдельно изменить `EnginePipeline` так, чтобы он использовал этот contract для последовательного выполнения algorithm instances.

Physics WASM/WebGPU implementation на текущем этапе не должна вносить изменения в `AnimationEngine` или `EnginePipeline`.
