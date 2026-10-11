# Задача: Physics Pipeline — тестирование

## Цель

Проектирование и реализация автоматических тестов Physics Pipeline — самостоятельная задача. Тестирование не должно описываться как один пункт lifecycle-документа: оно требует отдельной инфраструктуры, тестовой архитектуры и набора сценариев.

## 1. Границы

Задача охватывает:

- physics pass, temperature и stop condition;
- `EnginePipeline` как orchestrator;
- user `enabled` и runtime scheduling;
- `temperature → skipFrames` и граничные значения;
- агрегацию temperature (`maximum` / `average`);
- `Points Updating`;
- `Points Updated` при стабилизации;
- периодические checkpoints;
- повторный запуск, `stop()` и `destroy()`;
- независимость physics lifecycle от `AnimationEngine.stop()`;
- Mediator / View DTO boundary.

React UI и end-to-end тестирование всего приложения в эту задачу не входят без отдельного решения.

## 2. Test runner и инфраструктура

В проекте используется единый Node.js test runner через `test/index.ts`. Runtime-контексты разделены TypeScript-конфигурациями: shared tests используют `test/tsconfig.json`, клиентские — `packages/client/test/tsconfig.json`, серверные — `packages/server/test/tsconfig.json`.

Необходимо зафиксировать:

1. test runner и зависимости;
2. команду локального запуска;
3. TypeScript-конфигурации каждого runtime-контекста;
4. расположение тестовых файлов;
5. запуск тестов в CI;
6. способ управления timers и временем;
7. необходимость DOM-окружения.

Runner должен позволять детерминированно проверять scheduler, timers и порядок событий без ожидания реального времени и без зависимости от реального `requestAnimationFrame`.

Для typecheck используются отдельные команды контекстов: `typecheck:tests:utils`, `typecheck:tests:client` и `typecheck:tests:server`. Сводная команда `typecheck:tests` запускает их последовательно.

## 3. Принципы

Тесты проверяют наблюдаемое поведение и инварианты, а не конкретную внутреннюю реализацию. Private-поля Pipeline не должны становиться публичным тестовым контрактом, если поведение можно проверить через публичный API, результат physics или события Mediator.

Тесты должны быть:

- детерминированными;
- изолированными от сети и БД;
- независимыми от реальных 5-секундных ожиданий;
- независимыми от реальной частоты кадров;
- независимыми от React rendering cycle для domain lifecycle.

## 4. Physics pass и temperature

Проверить инвариант: выполненный `step()` одновременно изменяет состояние physics и формирует актуальную temperature.

Минимальные сценарии:

- выполненный `step()` обновляет temperature;
- Pipeline использует temperature именно этого pass;
- temperature доступна scheduler следующего решения;
- пропущенный scheduler-кадр не выполняет новый `step()` и не создаёт новую temperature;
- отдельный physics pass только ради temperature отсутствует.

## 5. Enabled и runtime scheduling

### User enabled

- `enabled = false` исключает physics из выполнения;
- `enabled = true` разрешает участие в scheduling;
- scheduler не изменяет `enabled` автоматически;
- изменение enabled через command отражается в состоянии Pipeline.

### Runtime scheduling

- enabled physics остаётся enabled во время skip;
- при `skipFrames = 0` physics выполняется при каждом доступном pass;
- положительный `skipFrames` действительно пропускает заданное число кадров;
- после skip physics снова получает `step()`;
- изменение точек другой physics может вернуть physics к более частому выполнению.

## 6. Temperature → skipFrames

Нужно проверить границы формулы и её монотонность:

- температура ниже scheduling-диапазона;
- `stopTemperature`;
- значения внутри диапазона `stopTemperature .. 2 * stopTemperature`;
- `2 * stopTemperature`;
- значения выше `2 * stopTemperature`;
- максимум `30` кадров;
- увеличение температуры внутри scheduling-диапазона не уменьшает `skipFrames`.

Граничные значения должны быть отдельными тест-кейсами, а не покрываться случайным набором чисел.

## 7. Агрегация temperature

Проверить:

- `maximum` выбирает максимальную температуру участвующих physics;
- `average` вычисляет среднее по участвующим physics;
- disabled physics не участвует в агрегате;
- пропущенная physics не получает новую temperature;
- агрегированная temperature обновляется после выполненного pass;
- смена стратегии агрегации не меняет `enabled`.

Для пустого набора enabled physics должен существовать явно определённый тестовый контракт, а не случайный результат реализации.

## 8. Points Updating

`Points Updating` — coarse-grained сигнал завершения Pipeline pass.

Проверить:

- событие возникает после соответствующего pass;
- несколько physics одного Pipeline дают одно событие за pass;
- порядок обновления presentation state и события соответствует принятому контракту;
- React-facing данные не содержат domain objects.

Если принят контракт, согласно которому полностью пропущенный pass не считается завершённым physics pass, это поведение должно быть отдельным тестом.

## 9. Points Updated и стабилизация

Проверить:

- финальное событие возникает после достижения stop conditions всеми enabled physics;
- disabled physics не мешает завершению;
- стабилизация одной physics не завершает Pipeline при работающей другой;
- финальный event не дублируется последним checkpoint;
- после завершения не остаются активные physics callbacks.

## 10. Checkpoints

Периодический `Points Updated` должен тестироваться через контролируемое время.

Минимальная последовательность:

    start → checkpoint interval → Points Updated → checkpoint interval → Points Updated

Проверить:

- checkpoint не возникает чаще заданного интервала;
- длительный run продолжает checkpoint-события;
- финальное событие не создаёт лишний дубль;
- timer останавливается после завершения;
- повторный запуск не создаёт второй независимый timer поверх первого.

Реальный `setTimeout(5000)` в тесте использовать нельзя.

## 11. Повторный запуск

Проверить lifecycle:

    start → run → finish/stop → start again → run → finish

Необходимо убедиться, что callbacks, skip state, checkpoint timer и финальные события первого запуска не протекают во второй запуск.

## 12. Stop, destroy и AnimationEngine

Тесты должны различать остановку Pipeline, уничтожение Pipeline и остановку `AnimationEngine`.

Ключевой инвариант: `Points Updated` не является следствием `AnimationEngine.stop()`.

Нужно проверить сценарий, где AnimationEngine продолжает обслуживать другие callbacks после завершения physics. Также `destroy()` должен удалять подписки, callbacks, timers и связанные runtime resources.

## 13. Temperature и View DTO

Temperature для UI должна быть presentation state, а не прямой публикацией physics в Mediator.

Проверить:

- React-facing state не содержит `EnginePipeline`, `BaseAlgorithm` или physics object;
- агрегированная temperature имеет контекст Pipeline;
- индивидуальная temperature остаётся доступной domain/scheduler части;
- UI-coalescing не изменяет значение, используемое scheduler;
- `flush()` перед завершением передаёт последнее актуальное значение, если это входит в контракт.

Точный `PipelineViewState` и temperature DTO определяются архитектурной задачей View DTO; тесты должны проверять этот контракт, а не внутреннюю структуру Pipeline.

## 14. Отсутствие скрытого coupling

Тестовая инфраструктура не должна требовать:

- передачи `EnginePipeline[]` в React;
- прямого вызова domain object из `PipelinePanel`;
- доступа UI к private runtime state;
- реального SVG DOM для physics lifecycle;
- реальной БД или сети.

Если тест требует такого coupling, сначала нужно проверить архитектурную границу.

## 15. Минимальная структура тестов

Тестовая инфраструктура разделяется по runtime-контекстам. Общий каталог `test/` содержит только базовую Node.js-конфигурацию и shared utility tests.

```text
test/
├── index.ts
├── tsconfig.json
└── utils/
    ├── observable-array.test.ts
    └── logger-singleRunner.test.ts

packages/
├── client/
│   └── test/
│       ├── tsconfig.json
│       └── core/
│           └── Engines/
│               └── AnimationEngine.test.ts
└── server/
    └── test/
        └── tsconfig.json
```

Клиентские тесты не должны находиться в общем `test/client`: клиент имеет собственную тестовую среду, собственный `tsconfig.json` и DOM lib.

Серверная тестовая среда также изолирована собственным `tsconfig.json`. Она наследуется от общего `test/tsconfig.json` без DOM.

Базовый `test/tsconfig.json` не содержит DOM и типизирует только shared utility tests. Клиентский `packages/client/test/tsconfig.json` наследуется от него и добавляет DOM libs. Серверский `packages/server/test/tsconfig.json` наследуется от него без DOM.

Смысловые группы тестов должны покрывать:

1. configuration;
2. physics pass / temperature;
3. temperature aggregation;
4. scheduler / skipFrames;
5. enabled vs runtime scheduling;
6. `Points Updating`;
7. `Points Updated` stabilization;
8. periodic checkpoints;
9. restart lifecycle;
10. stop / destroy;
11. Mediator / View DTO presentation state.

## 16. Definition of Done

- [x] Подключён и документирован единый test runner.
- [x] Есть единая команда локального запуска.
- [x] Тесты запускаются в CI.
- [ ] Timers и время lifecycle контролируются детерминированно.
- [ ] Покрыты temperature, scheduler и skip boundaries.
- [ ] Покрыты `enabled` и runtime scheduling как разные состояния.
- [ ] Покрыты `Points Updating` и `Points Updated`.
- [ ] Покрыты checkpoints и отсутствие финального дубля.
- [ ] Покрыт повторный запуск.
- [ ] Покрыты `stop()` / `destroy()` и отсутствие активных ресурсов.
- [ ] Проверена независимость lifecycle от `AnimationEngine.stop()`.
- [ ] Проверена граница View DTO / Mediator.
- [ ] Тесты не используют реальные 5-секундные ожидания и реальный RAF.