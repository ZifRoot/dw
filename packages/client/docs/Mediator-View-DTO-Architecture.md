# Архитектура Mediator, View DTO и Pipeline

## Статус

Документ фиксирует согласованные архитектурные тезисы по разделению SVG, physics/calculations и React UI. Работа начата от `dev`. Рабочая ветка: `docs/mediator-view-dto-architecture`.

## 1. Главная архитектурная граница

В клиенте есть три области:

1. SVG и низкоуровневая работа со сценой и точками.
2. Расчёты и physics engines.
3. React UI.

Они не должны напрямую зависеть друг от друга. Главная граница — `AppMediator`:

```text
                       AppMediator
                     /      |       \\
                    /       |        \\
                  SVG    Physics     React
```

React не знает о SVG; SVG не знает о React; Physics не знает о React; React не получает domain objects; SVG Engine напрямую управляет SVG DOM; Mediator передаёт события, команды и подготовленные для UI данные.

## 2. React не управляет SVG

SVG-сцена может содержать около 1000 и более точек. Передача `Point[]` в React на каждый physics frame и рендер через Virtual DOM создаёт ненужный overhead.

Правильно:

```text
Physics → SVG Engine → SVG DOM
```

а не:

```text
Physics → React → Virtual DOM → SVG
```

React используется для UI-панелей, но не как механизм управления основной SVG-сценой.

## 3. Несколько React roots допустимы

Например:

```text
Header       → React
Right Panel  → React
Left Panel   → React, если потребуется
Bottom Panel → React, если потребуется
SVG Scene    → SVG Engine
```

Не требуется объединять все UI области в один React root. Общий интерфейс React с остальной системой — `AppMediator`.

## 4. React не должен получать domain objects

Нельзя строить UI вокруг передачи через props объектов вроде `EnginePipeline[]` или `Point[]`.

React не должен знать о существовании `Point`, `EnginePipeline`, `BaseAlgorithm`, `PointGraphManager`, конкретных physics engines и других domain/runtime объектов.

Если такие объекты сейчас где-либо передаются в React, это архитектурный долг, который следует устранить.

## 5. View DTO — граница Domain → UI

Перед передачей данных в React domain-объект преобразуется в специальный объект представления:

```text
Point
  │
  │ преобразование
  ▼
PointView / UIPoint
  │
  │ snapshot / сериализация
  ▼
AppMediator
  │
  ▼
React
```

То же самое для Pipeline:

```text
EnginePipeline
    │
    │ синтез представления
    ▼
PipelineViewState
    │
    ▼
AppMediator
    │
    ▼
React
```

View DTO — не domain object, случайно переданный UI. Это объект, специально подготовленный для отображения. Он может быть очень похож на исходный объект и содержать практически те же данные, но это другой тип и другая граница ответственности.

Например, `UIPoint` **не должен содержать поле `point: Point`** или другую ссылку на domain object. Если UI нужен дополнительный текст документа, координаты или сведения о соседях, эти данные проецируются в DTO как обычные значения:

```ts
interface UIPoint {
  id: string;
  x: number;
  y: number;
  z: number;
  text: string;
  largeText?: string;
  pinned: boolean;
  selected: boolean;
  neighbors?: UIPointNeighbor[];
}
```

React получает только этот snapshot и не может через него добраться до `Point`, `PointGraphManager` или других runtime-объектов.

## 6. PipelineViewState

`PipelineViewState` — именно объект представления Pipeline, а не внутреннее состояние domain object, отданное React.

```text
EnginePipeline
  ├── entries
  ├── algorithms
  ├── PointGraphManager
  ├── runtime scheduler
  ├── temperatures
  └── другие domain/runtime данные
          │
          │ projection
          ▼
    PipelineViewState
          │
          ▼
      AppMediator
          │
          ▼
        React
```

React видит только поля, необходимые интерфейсу. Через View DTO нельзя получить ссылку на domain object.

## 7. Mediator не является Service Locator

Плохо превращать Mediator в контейнер объектов:

```text
mediator.pipelines = pipelines
mediator.pointGraphManager = pointGraphManager
mediator.animationEngine = animationEngine
```

Mediator должен быть boundary, а не хранилищем domain objects. Его контракт состоит из View DTO/snapshots, commands и events.

```text
React
  ↕
View DTO / Commands / Events
  ↕
AppMediator
  ↕
Domain
```

## 8. PipelinePanel и Mediator

`PipelinePanel` не должен получать `EnginePipeline[]` через props.

Желаемая модель:

```text
PipelinePanel
      │
      ▼
  AppMediator
      │
      ▼
EnginePipeline
```

Фактически React получает не сам `EnginePipeline`, а его View DTO:

```text
EnginePipeline → PipelineViewState → AppMediator → PipelinePanel
```

Изменения UI идут обратно через commands Mediator. UI не вызывает методы domain object напрямую.

## 9. Physics Pipeline: enabled и runtime scheduling различны

У physics есть два уровня управления.

`enabled` — пользовательская настройка Pipeline. Она определяет, включена ли physics. Pipeline не должен самостоятельно менять это значение из-за температуры.

Runtime scheduling — Pipeline может временно уменьшать частоту исполнения physics.

```text
all physics
    ↓ user enabled
enabled physics
    ↓ runtime scheduling
physics slots
```

Эти уровни нельзя смешивать.

## 10. Skip frames

Runtime scheduling выражается количеством кадров, которые physics может пропустить. Это не выключение physics.

```text
Температура далеко от stopTemperature → skipFrames = 0
Температура близка к stopTemperature  → skipFrames увеличивается
```

Ориентир максимального пропуска — около 30 кадров, то есть примерно 0.5 секунды при 60 FPS. Например, около 0.1 секунды — примерно 6 кадров.

Точная формула `temperature → skipFrames` пока не зафиксирована и должна быть отдельным решением.

Physics остаётся `enabled`. Если другая physics изменит точки, ранее почти стабилизировавшаяся physics при следующем редком запуске может снова получить высокую температуру и продолжить активно работать. Это позволяет не создавать прямые связи вида `GraphAlgorithm → invalidate RepulsionAlgorithm`.

## 11. Температура принадлежит конкретной physics

Глобальное `mediator.temperature` не является корректной моделью при нескольких physics. Каждая physics имеет собственную температуру.

Это отдельное важное архитектурное решение для View DTO: температура, отображаемая React, не должна быть безымянным глобальным числом в Mediator. Presentation state должен сохранять контекст Pipeline и, при необходимости, конкретной physics.

Нельзя делать:

```text
Repulsion → mediator.temperature
Graph     → mediator.temperature
ZDapper   → mediator.temperature
```

Если температуру нужно показывать в UI, она должна быть идентифицирована, например концептуально:

```text
{ pipeline, engine, temperature }
```

Не следует выполнять дополнительный physics pass только ради температуры. Температура должна быть результатом обычного `step()` / `applyStep()`.

## 12. Points Updating

`Points Updating` — событие завершения одного прохода Pipeline.

В pass:

1. определяется список enabled physics;
2. каждая physics получает шаг или пропускается по runtime scheduling;
3. после завершения pass возникает `Points Updating`.

Поэтому событие не обязано соответствовать каждому RAF. Обычно pass может завершаться каждый кадр, но при scheduler skip — реже.

Это coarse-grained сигнал для представления и не должен передавать React весь массив точек на каждый physics frame.

## 13. Points Updated

`Points Updated` — не синоним остановки AnimationEngine. Событие относится к завершению/фиксации состояния physics и используется, в частности, для сохранения точек.

### Полная стабилизация

Когда все enabled physics достигли stop condition:

```text
all enabled physics converged
        ↓
Points Updated
```

Событие должно возникать сразу после фактической стабилизации.

### Долгий physics run

Если расчёт продолжается долго, точки должны периодически фиксироваться. Интервал конфигурационный, ориентир по умолчанию — 5 секунд:

```text
t=0   start
t=5s  Points Updated
t=10s Points Updated
t=15s Points Updated
...
finish → Points Updated
```

`Points Updated` не должен происходить чаще заданного интервала. Нужно исключать дублирование финального события с периодическим checkpoint.

Отдельное правило для самого первого `Points Updated` после старта пока не зафиксировано.

## 14. Points Updated не привязан к AnimationEngine.stop()

`AnimationEngine` может продолжать обслуживать другие callbacks. Поэтому завершение physics нельзя определять через `AnimationEngine stopped → physics finished`.

Разные уровни ответственности:

- AnimationEngine — выполнение animation callbacks.
- EnginePipeline — orchestration physics.
- AppMediator — coarse-grained lifecycle events и UI boundary.

## 15. Общая модель Pipeline

```text
                         AppMediator
                       /      |       \\
                      /       |        \\
                    SVG    Physics     React
                             │           │
                       EnginePipeline    │
                             │           │
                 ┌───────────┴───────┐   │
                 │                   │   │
             user config        scheduler
                 │                   │
              enabled            skipFrames
                 │                   │
                 └───────────┬───────┘
                             │
                         physics step
                             │
                     Points Updating
                             │
                             ▼
                       View / SVG state

EnginePipeline
      │
      │ projection
      ▼
PipelineViewState
      │
      ▼
AppMediator
      │
      ▼
React
```

## 16. Ответственность компонентов

### Physics engine

Отвечает за собственный алгоритм, собственную температуру, собственный stop condition и результат одного шага.

Не отвечает за React, SVG, другие physics, БД и UI DTO.

### EnginePipeline

Отвечает за orchestration physics, user configuration `enabled`, runtime scheduling, `skipFrames`, определение завершения общего physics cycle, lifecycle events и синтез View DTO для Pipeline.

Не передаёт React свои domain objects.

### AppMediator

Отвечает за boundary между подсистемами: events, commands, View DTO/snapshots и подписки.

Не должен становиться Service Locator или контейнером domain objects.

### SVG Engine

Отвечает за SVG DOM и визуальное представление сцены. Не зависит от React.

### React

Отвечает за UI, отображение View DTO, отправку commands через Mediator и подписку на Mediator events/state. Не знает о domain objects.

## 17. Главный архитектурный принцип

Через границу передаются не сами объекты предметной области, а их специально подготовленное представление:

```text
Domain object
     │
     │ projection / serialization
     ▼
View DTO
     │
     ▼
Mediator
     │
     ▼
React
```

React должен знать только о DTO, предназначенных для него.

Это относится не только к `Point`, но и к Pipeline, physics и другим domain/runtime сущностям.

В результате изменение внутренней структуры `Point`, `EnginePipeline` или `BaseAlgorithm` не обязано менять React-код, пока сохраняется UI-контракт соответствующих View DTO.

## 18. Следующие отдельные решения перед реализацией

Перед кодированием необходимо отдельно согласовать:

1. точные типы View DTO;
2. точный контракт `AppMediator` для Pipeline;
3. commands изменения Pipeline configuration;
4. формат scheduler state;
5. формулу `temperature → skipFrames`;
6. конфигурацию checkpoint interval;
7. правило первого `Points Updated` после старта;
8. точный lifecycle повторного запуска physics;
9. тесты scheduler и lifecycle;
10. места текущей передачи domain objects в React, которые нужно заменить на View DTO.
