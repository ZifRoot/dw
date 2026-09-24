# AnimationEngine

## Назначение

AnimationEngine — единый планировщик покадровой работы клиентского приложения.

Его главная ответственность — владеть requestAnimationFrame и распределять зарегистрированные callback-функции между кадрами так, чтобы тяжёлая работа не занимала весь кадр браузера.

AnimationEngine не знает назначения callback'ов. Для него callback — абстрактная функция с сигнатурой AnimationCallback = (deltaTime: number) => void.

Архитектурная граница:

    Domain / Algorithm / Manager
                │
                │ callback
                ▼
        ┌─────────────────┐
        │ AnimationEngine │
        └─────────────────┘
                │
                │ requestAnimationFrame
                ▼
             Browser

В проекте действует правило: только AnimationEngine непосредственно вызывает requestAnimationFrame.

## 1. Возможности

### 1.1. Регистрация одного callback

Для одной независимой задачи используется addCallback(callback). Метод возвращает disposer, который удаляет зарегистрированный callback.

После удаления последнего callback animation loop останавливается.

### 1.2. Регистрация группы callback'ов

Для группы независимых шагов используется addCallbacks(callbacks). Метод возвращает один disposer для всей группы.

Это используется EnginePipeline: Pipeline строит список callback'ов из включённых алгоритмов и регистрирует его в AnimationEngine.

### 1.3. Один requestAnimationFrame для всех пользователей

В приложении используется один экземпляр AnimationEngine. Несколько подсистем могут зарегистрировать в нём свои callback'и.

Текущие потребители на dev включают ModelManager, LevenshteinManager и EnginePipeline.

### 1.4. Cooperative round-robin

AnimationEngine хранит порядок callback'ов и cursor. За один кадр он выполняет callback'и последовательно, пока не исчерпан вычислительный бюджет или не обработаны callback'и текущего прохода.

Таким образом, несколько независимых задач получают возможность прогрессировать без отдельного RAF-loop каждая.

### 1.5. Автоматическое измерение бюджета кадра

AnimationEngine не получает frameBudgetMs из конфигурации.

При первом запуске callback'ов выполняется калибровка через requestAnimationFrame:

1. измеряются последовательные интервалы между RAF;
2. используется 5 кадров калибровки, то есть 4 измеренных интервала;
3. вычисляется среднее время кадра;
4. 80% среднего используется как вычислительный бюджет.

Формула: frameBudget = averageFrameTime × 0.8.

Пример: при 60 FPS средний интервал около 16.67 ms, поэтому вычислительный бюджет около 13.34 ms. При 120 FPS — около 6.66 ms.

Оставшиеся примерно 20% не используются планировщиком как вычислительный бюджет.

Важно: в актуальной реализации калибровка выполняется лениво при первом запуске callback'ов, а не в конструкторе.

### 1.6. deltaTime

Каждый callback получает время между animation frames. Оно вычисляется по timestamp текущего и предыдущего RAF.

### 1.7. Автоматическая остановка

AnimationEngine работает, пока зарегистрирован хотя бы один callback. Удаление последнего callback останавливает loop. clear() удаляет все callback'и и останавливает engine.

## 2. Как составляется план выполнения

Важно разделять две ответственности.

AnimationEngine отвечает за «когда»: список callback'ов, порядок, cursor, время кадра, доступный бюджет и следующий RAF.

EnginePipeline отвечает за «что и в каком порядке»: состав алгоритмов, имена, enabled/disabled, runtime scheduling, температуры, завершение physics pass и публикацию Points Updating / Points Updated.

### 2.1. План одного кадра

Упрощённо:

    requestAnimationFrame
            │
            ▼
        start frame
            │
            ├── определить deltaTime
            ├── запомнить время начала
            ├── взять callback с текущего cursor
            ├── выполнить callback
            ├── перейти к следующему callback
            ├── проверить оставшийся budget
            └── если budget позволяет — выполнить следующий callback
            │
            ▼
    requestAnimationFrame(...)

Ключевой принцип: AnimationEngine не пытается разбить произвольную большую synchronous-функцию. Задача должна сама быть представлена небольшими callback-операциями.

## 3. EnginePipeline

Текущий EnginePipeline является владельцем последовательности physics algorithms.

Концептуально его callback-группа содержит:

    RepulsionAlgorithm
          ↓
    GraphAlgorithm
          ↓
    ZDapperAlgorithm
          ↓
    final callback

Финальный callback pipeline-level отвечает за агрегирование температуры, Points Updating, проверку завершения активных алгоритмов и завершение pipeline.

AnimationEngine при этом не знает, что эти callback'и относятся к physics.

## 4. Runtime scheduling

Pipeline дополнительно решает, насколько часто конкретному physics algorithm нужен step(). enabled и runtime scheduling — разные состояния.

enabled = true означает участие алгоритма в pipeline. Runtime skip может временно не давать ему step(), когда температура близка к stopTemperature.

Runtime skip не выключает algorithm. Если другая physics изменила точки и температура снова выросла, algorithm снова может выполняться чаще.

Таким образом, AnimationEngine предоставляет временной механизм, а Pipeline использует его для более высокого уровня scheduling.

## 5. Кто использует AnimationEngine на dev

### ModelManager

ModelManager регистрирует callback через AnimationEngine и выполняет оптимизацию модели порциями.

### LevenshteinManager

LevenshteinManager регистрирует собственный callback через AnimationEngine для постепенного выполнения своей работы.

### EnginePipeline

EnginePipeline использует addCallbacks() для регистрации текущего набора physics callback'ов.

В bootstrap AnimationEngine создаётся один раз и передаётся потребителям.

## 6. Почему AnimationEngine не должен знать о Pipeline

Нежелательная зависимость:

    AnimationEngine → EnginePipeline → Physics

Предпочтительная:

    ModelManager ───────┐
    LevenshteinManager ─┼──→ AnimationEngine
    EnginePipeline ─────┘

AnimationEngine не должен знать, что такое physics, pipeline, point, graph или temperature.

Это позволяет использовать его для новых типов фоновой покадровой работы без изменения самого AnimationEngine.

## 7. Перспектива addGenerator(generator)

Ранее рассматривался специализированный API addGenerator(generator), где generator представляет последовательный workflow и выдаёт callback'и.

Концептуально:

    generator
       │
       ├── callback #1
       ├── callback #2
       ├── callback #3
       └── callback #4

Такая модель хорошо соответствует первоначальной идее physics pipeline: Pipeline определяет порядок, а AnimationEngine определяет, когда следующий callback можно выполнить.

### 7.1. Почему generator может быть полезен

Generator позволяет выразить последовательный workflow одной конструкцией. Это становится особенно интересно для большого числа условных или динамических этапов.

### 7.2. Почему generator пока не обязателен

Текущий API addCallbacks() уже позволяет Pipeline построить массив callback'ов и зарегистрировать их одной группой.

При изменении состава или enabled Pipeline может удалить зарегистрированную группу и построить её заново. Поэтому добавление generator сейчас не обязательно.

### 7.3. Ограничение generator

Generator не делает произвольный synchronous JavaScript-код прерываемым.

Если один yield возвращает callback, внутри которого находится огромный синхронный цикл, AnimationEngine всё равно не сможет остановить этот цикл посередине.

Поэтому generator решает прежде всего задачу представления последовательности, а не задачу прерывания JavaScript.

### 7.4. Возможный будущий API

Если потребность появится, API может выглядеть так:

    addCallback(callback): Dispose
    addCallbacks(callbacks): Dispose
    addGenerator(generator): Dispose

Первые два API останутся простыми для обычных пользователей. addGenerator() будет специализированным API для сложных последовательных workflow.

Внутренняя модель при этом может оставаться общей: все формы регистрации приводят к работе планировщика callback'ов, который владеет requestAnimationFrame.

## 8. Итоговая модель ответственности

    AnimationEngine
        ├── RAF
        ├── frame calibration
        ├── frame budget
        ├── callback scheduling
        └── round-robin
                 │
                 ├── ModelManager
                 ├── LevenshteinManager
                 └── EnginePipeline
                         ├── Repulsion
                         ├── Graph
                         ├── ZDamping
                         └── final callback

Главный архитектурный принцип:

> AnimationEngine управляет временем. EnginePipeline управляет последовательностью и состоянием алгоритмов. Алгоритмы выполняют предметную работу.

Такое разделение позволяет добавлять новые потребители AnimationEngine, не превращая его в компонент, знающий обо всей архитектуре приложения.