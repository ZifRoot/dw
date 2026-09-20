# Задача: Physics Pipeline — lifecycle, temperature и scheduling

## Цель

Зафиксировать согласованную модель жизненного цикла Physics Pipeline и правило работы с температурой физических алгоритмов.

Задача относится к Pipeline, physics engines, событиям `Points Updating` / `Points Updated` и передаче агрегированного состояния в UI через `AppMediator`.

---

## 1. Температура является частью physics pass

Температура **не является отдельной UI-телеметрией**.

Для каждой physics:

- physics изменяет позиции точек в рамках своего `step()` / pass;
- в рамках того же прохода она обязательно вычисляет температуру;
- температура является результатом этого прохода и участвует в критериях scheduling / пропуска следующих ходов;
- отдельный проход только ради вычисления температуры создавать нельзя.

Для алгоритмов, где температура рассчитывается по взаимодействиям точек, правило остаётся частью самого алгоритма. Например, для каждой пары точек может вычисляться локальная температура, после чего physics получает свою агрегированную температуру (например, максимальную).

**Инвариант:**

> Если physics выполнила ход, результатом этого хода должна быть не только модификация позиций, но и актуальная температура этой physics.

---

## 2. Physics не передаёт температуру напрямую в Mediator

Некорректная модель:

```text
Physics → AppMediator → UI
```

Каждая physics не должна самостоятельно публиковать свою температуру в Mediator.

Правильная граница ответственности:

```text
Physics
   ↓
собственная temperature
   ↓
EnginePipeline
   ↓
агрегация температур
   ↓
Pipeline temperature
   ↓
AppMediator / View DTO
   ↓
UI
```

Pipeline является владельцем агрегированного состояния всех активных physics.

---

## 3. Агрегированная температура Pipeline

Pipeline собирает температуры physics, которые участвуют в текущем scheduling.

Способ агрегации должен быть настраиваемым:

- **maximum temperature** — показывает наиболее «горячую» physics;
- **average temperature** — показывает среднее состояние активных physics.

Выбор метода агрегации является настройкой Pipeline, а не обязанностью отдельной physics.

При этом индивидуальные температуры physics должны оставаться доступными внутри Pipeline, потому что они нужны для собственных критериев scheduling.

---

## 4. Enabled и runtime scheduling — разные состояния

Для каждой physics существуют два разных понятия.

### User enabled

Пользовательская настройка Pipeline:

```text
enabled = true / false
```

Она определяет, участвует ли physics вообще в Pipeline.

Pipeline не должен автоматически изменять этот флаг.

### Runtime scheduling

Даже enabled physics может временно не получать `step()`, если её температура достаточно близка к критерию остановки.

```text
all physics
    ↓ enabled
enabled physics
    ↓ runtime scheduling
physics получает step() / пропускает кадр
```

Runtime skip не означает отключение physics.

---

## 5. Пропуск ходов по температуре

Temperature используется для определения количества кадров, которые physics может пропустить.

Общая идея:

- температура далеко от `stopTemperature` → `skipFrames = 0`;
- температура приближается к `stopTemperature` → physics может пропускать несколько кадров;
- physics остаётся enabled;
- после периода skip она снова получает ход и пересчитывает температуру;
- если другая physics изменила точки, температура может снова вырасти, и physics должна снова начать выполняться чаще.

Ориентир максимального skip:

- около 30 кадров;
- при 60 FPS это примерно 0.5 секунды.

Точная формула:

```text
temperature + stopTemperature → skipFrames
```

пока не зафиксирована и должна быть выбрана отдельно.

---

## 6. Points Updating

`Points Updating` соответствует завершению одного прохода Pipeline.

Проход:

1. Pipeline рассматривает enabled physics.
2. Для каждой physics определяется, нужно ли выполнить `step()` или применить runtime skip.
3. Выполненные physics изменяют позиции и одновременно вычисляют собственные температуры.
4. Pipeline собирает температуры и вычисляет агрегированную Pipeline temperature.
5. Завершается текущий pass.
6. Публикуется `Points Updating`.

То есть `Points Updating` не обязан происходить на каждый RAF-кадр. Он связан именно с завершённым Pipeline pass.

---

## 7. Передача температуры в UI

Агрегированная Pipeline temperature может передаваться UI в контексте `Points Updating`.

Это допустимо и соответствует архитектуре:

```text
Pipeline pass
    ↓
temperature aggregation
    ↓
Points Updating
    ↓
Mediator / View DTO
    ↓
React UI
```

При этом React не получает domain objects и не получает отдельные physics objects.

Температура должна входить в presentation state / View DTO, который Pipeline подготавливает для UI.

---

## 8. Throttler

Температура должна вычисляться на каждом выполненном physics pass, даже если UI получает её реже.

Throttler можно применять **после** вычисления температуры:

```text
Physics step
    ↓
actual physics temperature
    ↓
Pipeline aggregation
    ↓
Points Updating
    ↓
Throttler
    ↓
UI temperature update
```

Throttler не должен тормозить сам physics pass и не должен менять критерии scheduling.

Причина:

- physics должна иметь актуальную температуру для runtime scheduling;
- частота обновления React/UI — отдельный вопрос;
- `Points Updating` уже связан с обновлением SVG, которое значительно дороже обычного изменения input/control;
- поэтому передача температуры вместе с Updating не является сама по себе существенной нагрузкой.

Температуру можно передавать UI реже, чем происходит `Points Updating`, если это потребуется.

Конкретный интервал throttling пока не зафиксирован.

---

## 9. Points Updated

`Points Updated` не должен быть связан с `AnimationEngine.stop()`.

Он имеет две независимые причины публикации:

### Стабилизация

Когда все enabled physics достигли своих stop conditions, Pipeline должен зафиксировать завершённое состояние через `Points Updated`.

### Периодический checkpoint

При длительном physics run Pipeline должен периодически публиковать `Points Updated`, чтобы внешние системы могли сохранять актуальные позиции.

Ориентир:

```text
start
  ↓
~5 s → Points Updated
  ↓
~10 s → Points Updated
  ↓
~15 s → Points Updated
  ↓
...
finish → Points Updated
```

Интервал checkpoint должен быть configurable.

Необходимо отдельно обеспечить отсутствие лишнего дублирования финального события с только что отправленным периодическим checkpoint.

---

## 10. AnimationEngine

`AnimationEngine` отвечает за выполнение animation callbacks и frame scheduling.

Он не является источником истины о состоянии physics.

В частности:

- завершение physics не определяется через `AnimationEngine.stop()`;
- `Points Updated` не должен быть привязан к остановке AnimationEngine;
- Pipeline самостоятельно определяет завершение enabled physics по их состояниям / stop conditions.

Это особенно важно, поскольку в AnimationEngine могут существовать другие callbacks и независимые долгие операции.

---

## 11. AppMediator / View DTO

React не должен напрямую получать:

- `EnginePipeline`;
- `BaseAlgorithm`;
- physics engines;
- `Point`;
- другие domain objects.

Граница:

```text
Domain
  ↓ projection
View DTO
  ↓
AppMediator
  ↓
React
```

Для Pipeline состояние, отображаемое в Control Panel, должно быть представлено отдельным View DTO / `PipelineViewState`.

В частности, агрегированная температура Pipeline является частью presentation state, а не прямой публикацией температуры physics в Mediator.

---

## 12. Что необходимо реализовать

- [ ] Убрать модель единой глобальной `mediator.temperature` как источника температуры physics.
- [ ] Зафиксировать передачу температуры от каждой physics в Pipeline как результат её `step()`.
- [ ] Сохранить индивидуальные температуры physics внутри Pipeline для scheduling.
- [ ] Реализовать агрегирование температур Pipeline: maximum / average.
- [ ] Определить и реализовать формулу `temperature → skipFrames`.
- [ ] Ограничить максимальный runtime skip ориентиром около 30 кадров.
- [ ] Разделить user `enabled` и runtime scheduling state.
- [ ] Определить `Points Updating` как завершение Pipeline pass.
- [ ] Передавать агрегированную Pipeline temperature в UI через View DTO / Mediator.
- [ ] Использовать существующий `Throttler` для ограничения частоты UI temperature updates, не влияя на physics scheduling.
- [ ] Обеспечить финальную передачу актуальной температуры после стабилизации.
- [ ] Реализовать `Points Updated` при полной стабилизации.
- [ ] Реализовать периодические `Points Updated` checkpoints с configurable interval.
- [ ] Не связывать `Points Updated` с `AnimationEngine.stop()`.
- [ ] Добавить/обновить тесты lifecycle: start → passes → runtime skips → stabilization → final `Points Updated`.
- [ ] Проверить отсутствие дублирования финального и периодического `Points Updated`.
- [ ] Актуализировать `MediatorScene` после изменения contract/events.

---

## 13. Пока не зафиксировано

Следующие решения намеренно оставлены отдельными задачами:

1. точная формула преобразования температуры в `skipFrames`;
2. окончательный выбор aggregation mode по умолчанию (maximum или average);
3. точный interval для UI temperature throttling;
4. точный interval периодического `Points Updated` checkpoint;
5. политика первого checkpoint после старта;
6. точная форма `PipelineViewState` и temperature DTO.
