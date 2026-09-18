/**
 * ============================================================================
 * SINGLE-RUNNER — дедупликация одновременных запусков
 * ============================================================================
 *
 * ИДЕОЛОГИЯ
 * ---------
 *
 * Есть долгие тяжёлые операции (минуты). Желающих получить результат —
 * много. Полноценное решение — таски: создать задачу, вернуть id, поллить
 * статус. Это инфраструктурно дорого.
 *
 * Single-runner — лёгкая аппроксимация тасок без их инфраструктуры.
 * Метафора: автобус. Первый пассажир открывает рейс. Кто пришёл, пока
 * автобус едет, — едет вместе со всеми и выходит на той же остановке.
 * Когда рейс приземлился — слот освобождён.
 *
 * Это НЕ мемоизация: результат не кэшируется.
 * Это НЕ очередь: никто не ждёт своей очереди, все прилипают к текущему.
 * Это НЕ ограничитель параллелизма.
 *
 *
 * ЧЕГО SINGLE-RUNNER НЕ ДЕЛАЕТ
 * ----------------------------
 *
 * Single-runner НЕ обрабатывает ошибки. У него нет доступа к получателям
 * (консоль, файл, БД) и не должно быть. Куда положить ошибку, кому её
 * показать, проглотить её или пробросить — это всегда решение ЛОГЕРА.
 *
 * Раннер, получив ошибку от рейса, имеет право только на одно действие:
 * изменить своё собственное состояние. Всё остальное — вне его зоны
 * ответственности.
 *
 *
 * АВТОМАТ СОСТОЯНИЙ
 * -----------------
 *
 *   IDLE     — рейса нет, ошибки нет.
 *   RUNNING  — рейс в воздухе, есть Promise.
 *   FAILED   — рейса нет, есть залипшая ошибка (+ timestamp для TTL).
 *
 *   IDLE    → RUNNING   при первом пассажире
 *   RUNNING → IDLE      при успехе
 *   RUNNING → ???       при ошибке — зависит от поведения (см. ниже)
 *   FAILED  → RUNNING   при снятии залипания
 *
 *
 * ПОВЕДЕНИЕ ПРИ ОШИБКЕ: ДВА ИЗМЕРЕНИЯ
 * -----------------------------------
 *
 * Измерение 1 — что делать с ошибкой.
 *
 *   • RETRY   — слот освобождается, следующий пассажир открывает новый
 *               рейс. Состояние FAILED не используется.
 *
 *   • STICKY  — ошибка залипает. Все приходящие получают тот же reject,
 *               пока залипание не снято.
 *
 * Измерение 2 — как снимается залипание (актуально только для STICKY).
 *
 *   • По времени (TTL). У залипшей ошибки есть «срок годности».
 *     После истечения следующий пассажир открывает новый рейс.
 *
 *   • Внешним сбросом. Кто-то извне (сосед-метод на общем guard'е
 *     или явный guard.reset()) снимает залипание.
 *
 * Отсюда три практических режима:
 *
 *   retry  = RETRY
 *   ttl    = STICKY + снятие по времени
 *   strict = STICKY + снятие внешним сбросом
 *
 *
 * ПОЧЕМУ STRICT БЕЗ GUARD'А НЕ СУЩЕСТВУЕТ
 * ---------------------------------------
 *
 * Strict без guard'а — это клетка, в которой снятия залипания нет вообще.
 * Не «редкий режим», а отсутствие механизма восстановления. Если упало —
 * упало навсегда, до конца жизни процесса.
 *
 * Такое поведение не должно быть выразимо через single-runner. Если
 * реально нужно «раз упало, значит навсегда» — это доменная логика
 * (флаг в БД, состояние в бизнес-объекте), а не забота раннера.
 *
 * Поэтому strict доступен ТОЛЬКО на общем внешнем guard'е, где есть
 * сосед-метод или явный reset(). Без guard'а — только retry и ttl.
 *
 *
 * ДВЕ НЕЗАВИСИМЫЕ ОСИ API
 * -----------------------
 *
 * Ось 1 — где живёт автомат (guard).
 *
 *   • Внутренний. Guard создаётся декоратором по символу внутри
 *     экземпляра (для методов) или в замыкании (для свободных функций).
 *     Один метод/функция = один автомат. Сброс снаружи невозможен.
 *
 *   • Внешний. Guard передаётся снаружи. Может быть общим для нескольких
 *     методов. Даёт доступ к reset() и позволяет strict.
 *
 * Ось 2 — поведение при ошибке.
 *
 *   • Внутренний автомат: retry или ttl.
 *   • Внешний автомат:    retry, ttl или strict.
 *
 *
 * ТАБЛИЦА ДЕКОРАТОРОВ И ФАБРИК
 * ----------------------------
 *
 * Свободные функции (в TS декораторов на функциях нет — только HOF):
 *
 *   createSingleRunner(fn)         — retry, свой автомат в замыкании
 *   createSingleRunnerTTL(fn, ms)  — ttl,   свой автомат в замыкании
 *
 * Методы класса, внутренний автомат (символ на экземпляре):
 *
 *   @SingleExecution               — retry, без скобок
 *   @SingleExecutionTTL(ms)        — ttl,   со скобками
 *
 * Методы класса, общий внешний автомат (передаётся guard):
 *
 *   @SingleGuardedRetry(guard)     — retry,  со скобками
 *   @SingleGuardedStrict(guard)    — strict, со скобками
 *   @SingleGuardedTTL(guard, ms)   — ttl,    со скобками
 *
 * Правило: скобки появляются, только если декоратору что-то нужно
 * передать (guard или ms). Если передавать нечего — декоратор без скобок.
 *
 *
 * ВАРИАНТ А: STRICT И RETRY НА ОДНОМ АВТОМАТЕ
 * -------------------------------------------
 *
 * Strict и retry могут сосуществовать на одном автомате, если повесить
 * их на общий внешний guard:
 *
 *     const syncGuard = new ExecutionGuard();
 *
 *     @SingleGuardedStrict(syncGuard)
 *     fetchStrict() { ... }
 *
 *     @SingleGuardedRetry(syncGuard)
 *     fetchRetry() { ... }
 *
 * Сценарий:
 *
 *   t0: fetchStrict() → RUNNING
 *   t1: рейс упал → FAILED (E)
 *   t2: fetchStrict() → получает E (FAILED → FAILED)
 *   t3: fetchStrict() → получает E (FAILED → FAILED)
 *   t4: fetchRetry()  → E уничтожена, слот очищен, открыт новый рейс
 *   t5: fetchStrict() → прилипает к новому рейсу (RUNNING)
 *
 * RETRY при входе в FAILED-состояние УНИЧТОЖАЕТ залипшую ошибку.
 * Это не побочный эффект, а осознанная семантика. RETRY говорит:
 * «я не верю, что эта ошибка окончательна, я открываю новый рейс».
 *
 * Strict-пассажир в цикле «ждёт попутчика» — дожидается, пока кто-то
 * другой проявит инициативу. Явный сброс strict'у не нужен.
 *
 *
 * ЯВНЫЙ СБРОС
 * -----------
 *
 * У ExecutionGuard есть метод reset(). Он сбрасывает залипшую ошибку
 * (состояние FAILED). На идущий рейс (RUNNING) не влияет.
 *
 * Актуален только для strict/ttl на внешнем guard'е. Внутренние
 * декораторы сбросить нельзя — там guard спрятан и недоступен снаружи.
 *
 *
 * КОМБИНАЦИЯ С ЛОГЕРОМ
 * --------------------
 *
 * Порядок декораторов определяет, кто кого видит.
 * Обозначения: L = логер, S = single-runner, M = метод.
 *
 *   @L @S M    — логер снаружи, раннер внутри
 *
 *     L видит КАЖДЫЙ вызов, включая присоединившихся пассажиров.
 *     В логе будет N записей о старте при N вызовах.
 *     Решение «глотать / пробрасывать» — на L, как и всегда.
 *
 *   @S @L M    — раннер снаружи, логер внутри
 *
 *     L видит ТОЛЬКО реальные запуски. Присоединившиеся для него
 *     невидимы — они не доходят до M, а значит и до L.
 *     Логируется ровно ОДНА ошибка на рейс, а не N штук от N пассажиров.
 *     Это критично, когда логер пишет не в консоль, а в файл или БД.
 *
 *
 * ПРАВИЛА ВЫБОРА ПОРЯДКА
 * ----------------------
 *
 *   Хочешь видеть в логах каждый вызов    → @L @S M
 *   Хочешь видеть только реальные запуски → @S @L M
 *
 *
 * РАЗДЕЛЕНИЕ ОТВЕТСТВЕННОСТИ
 * --------------------------
 *
 *   RUNNER отвечает за:  как рейсы группируются,
 *                        когда открывается новый,
 *                        когда ошибка залипает / уничтожается.
 *
 *   LOGGER отвечает за:  куда ошибка попадает,
 *                        проглотить её или пробросить,
 *                        как её увидит вызывающий код.
 *
 *   Никогда наоборот. Runner не пишет в консоль. Logger не управляет
 *   состоянием рейсов.
 *
 *
 * КОГДА ЧТО ИСПОЛЬЗОВАТЬ
 * ----------------------
 *
 *   Транзиентные ошибки (сеть, таймаут, внешний сервис упал),
 *   повтор осмыслен                                        → retry
 *
 *   Транзиентная ошибка, но с «периодом остывания»:
 *   не дёргаем сервис N мс после падения                   → ttl(ms)
 *
 *   Ошибка окончательная, но есть кому снять залипание
 *   (сосед-retry или явный reset())                        → strict + guard
 */

// ============================================================
// 0. Тип режима и автомат состояния
// ============================================================

/**
 * Полный набор режимов, которые понимает ExecutionGuard.
 * Не все режимы доступны всем фабрикам:
 *   внутренний автомат — только "retry" и "ttl";
 *   внешний автомат    — все три.
 */
export type SingleRunnerMode = "retry" | "strict" | "ttl";

interface FailedState {
  error: unknown;
  timestamp: number;
  /**
   * Заранее сконструированная rejected-промиса. Возвращается всем
   * вызывающим в strict/ttl-режиме, пока ошибка залипла. На неё
   * навешан no-op catch, чтобы Node не ругался unhandledRejection,
   * если вызывающий не подписался.
   */
  promise: Promise<never>;
}

/**
 * Автомат состояний single-runner.
 *
 * Хранит:
 *   running — текущий рейс (Promise), либо null.
 *   failed  — залипшую ошибку (для strict/ttl), либо null.
 *
 * Не знает ни о каких получателях логов. Не имеет права.
 */
export class ExecutionGuard {
  private running: Promise<unknown> | null = null;
  private failed: FailedState | null = null;

  /**
   * Точка входа. Режим задаёт декоратор, чей вызов сюда пришёл.
   * Один и тот же guard может принимать вызовы с разными режимами —
   * это и есть «вариант А».
   */
  tryStart<T>(fn: () => Promise<T>, mode: SingleRunnerMode, ttl?: number): Promise<T> {
    // RUNNING — присоединяемся к текущему рейсу.
    if (this.running) {
      return this.running as Promise<T>;
    }

    // FAILED — режим решает, что делать с залипшей ошибкой.
    if (this.failed) {
      if (mode === "retry") {
        // RETRY уничтожает ошибку и открывает новый рейс.
        this.failed = null;
      } else if (mode === "strict") {
        // STRICT возвращает тот же reject.
        return this.failed.promise as Promise<T>;
      } else {
        // TTL: смотрим на возраст ошибки.
        const age = Date.now() - this.failed.timestamp;
        if (ttl === undefined || age < ttl) {
          return this.failed.promise as Promise<T>;
        }
        // Протухла — слот очищается, открывается новый рейс.
        this.failed = null;
      }
    }

    // IDLE — открываем новый рейс.
    return this.startRun(fn, mode);
  }

  /**
   * Сбрасывает залипшую ошибку. На идущий рейс не влияет.
   *
   * После reset() следующий вызов в режиме strict или ttl откроет
   * новый рейс, как если бы ошибки не было.
   */
  reset(): void {
    this.failed = null;
  }

  private startRun<T>(fn: () => Promise<T>, mode: SingleRunnerMode): Promise<T> {
    // Promise.resolve().then(...) — гарантирует, что синхронный throw
    // внутри fn превратится в rejected-промису, а не вылетит наружу.
    const promise = Promise.resolve().then(() => fn());
    this.running = promise;

    // then(onSuccess, onError) — не finally().
    // Обе ветки обрабатываются, поэтому производная промиса ВСЕГДА
    // резолвится, и не создаётся unhandledRejection.
    promise.then(
      () => {
        this.running = null;
      },
      (error) => {
        this.running = null;

        if (mode === "strict" || mode === "ttl") {
          const rejected = Promise.reject(error);
          // Помечаем промису обработанной. Никакой логики — чисто
          // страховка от unhandledRejection, если ни один вызывающий
          // не подписался.
          rejected.catch(() => {});
          this.failed = {
            error,
            timestamp: Date.now(),
            promise: rejected,
          };
        }
        // retry: слот просто освобождён. Ошибка никуда не залипает.
      },
    );

    return promise;
  }
}

// ============================================================
// 1. Свободные функции — HOF-обёртки, свой автомат в замыкании
// ============================================================
//
// В TypeScript декораторов на обычных функциях не существует —
// только HOF-применение: const wrapped = createSingleRunner(fn).
//
// Guard живёт в замыкании обёртки. Один вызов фабрики = один автомат.
// Поделиться автоматом с другой функцией через эти фабрики нельзя.
// Если нужно — используйте общий ExecutionGuard и передавайте его
// в createGuardedRunner'ы вручную (см. пример ниже в комментариях).

/**
 * Оборачивает свободную async-функцию в single-runner, режим retry.
 * Свой автомат, закрытый в замыкании обёртки.
 */
export function createSingleRunner<TArgs extends unknown[], TReturn>(fn: (...args: TArgs) => Promise<TReturn>): (...args: TArgs) => Promise<TReturn> {
  const guard = new ExecutionGuard();
  return (...args: TArgs) => guard.tryStart(() => fn(...args), "retry");
}

/**
 * Оборачивает свободную async-функцию в single-runner, режим ttl.
 * При падении ошибка залипает, но через ttl мс считается протухшей
 * и следующий вызов открывает новый рейс.
 *
 * @param fn   Оборачиваемая функция.
 * @param ttl  Время жизни залипшей ошибки в миллисекундах.
 */
export function createSingleRunnerTTL<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  ttl: number,
): (...args: TArgs) => Promise<TReturn> {
  const guard = new ExecutionGuard();
  return (...args: TArgs) => guard.tryStart(() => fn(...args), "ttl", ttl);
}

// ============================================================
// 2. Методы класса — внутренний автомат (символ на экземпляре)
// ============================================================
//
// Guard создаётся лениво, при первом вызове, и кладётся на экземпляр
// по символу. Каждый метод получает свой символ, а значит и свой
// автомат. Поделиться с другим методом нельзя.
//
// Снаружи (из кода класса) этот guard недоступен, поэтому reset()
// для внутренних декораторов невозможен в принципе, и strict
// в этом семействе недоступен — только retry и ttl.

/**
 * Оборачивает метод класса в single-runner с внутренним автоматом.
 *
 * @param fn   Метод.
 * @param mode Режим. Для внутреннего автомата — "retry" или "ttl".
 *             "strict" здесь не поддерживается: без внешнего reset()
 *             он превращался бы в «навсегда упавшее» состояние.
 * @param ttl  Таймаут для режима "ttl" (мс).
 */
export function createInternalRunner<This, Args extends unknown[], Return>(
  fn: (this: This, ...args: Args) => Promise<Return>,
  mode: "retry" | "ttl",
  ttl?: number,
): (this: This, ...args: Args) => Promise<Return> {
  const guardKey = Symbol("single-runner-guard");

  return function (this: This, ...args: Args): Promise<Return> {
    let guard: ExecutionGuard | undefined = (this as any)[guardKey];
    if (!guard) {
      guard = new ExecutionGuard();
      (this as any)[guardKey] = guard;
    }
    return guard.tryStart(() => fn.apply(this, args), mode, ttl);
  };
}

// ============================================================
// 3. Методы класса — внешний автомат (переданный guard)
// ============================================================
//
// Guard передаётся снаружи и может быть общим для нескольких методов.
// Именно так реализуется «вариант А»: strict и retry на одном автомате.

/**
 * Оборачивает метод класса в single-runner с внешним автоматом.
 */
export function createGuardedRunner<This, Args extends unknown[], Return>(
  fn: (this: This, ...args: Args) => Promise<Return>,
  guard: ExecutionGuard,
  mode: SingleRunnerMode,
  ttl?: number,
): (this: This, ...args: Args) => Promise<Return> {
  return function (this: This, ...args: Args): Promise<Return> {
    return guard.tryStart(() => fn.apply(this, args), mode, ttl);
  };
}

// ============================================================
// 4. Декораторы: семейство внутреннего автомата
// ============================================================

/** retry. Без скобок. Автомат внутренний, свой на метод. */
export function SingleExecution(target: any, propertyKey: string, descriptor: PropertyDescriptor): void {
  descriptor.value = createInternalRunner(descriptor.value, "retry");
}

/**
 * ttl. Со скобками (нужен ms). Автомат внутренний, свой на метод.
 * После истечения TTL ошибка считается протухшей, и следующий вызов
 * открывает новый рейс.
 */
export function SingleExecutionTTL(ttl: number) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor): void {
    descriptor.value = createInternalRunner(descriptor.value, "ttl", ttl);
  };
}

// ============================================================
// 5. Декораторы: семейство внешнего автомата
// ============================================================

/** retry на общем автомате. Со скобками (нужен guard). */
export function SingleGuardedRetry(guard: ExecutionGuard) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor): void {
    descriptor.value = createGuardedRunner(descriptor.value, guard, "retry");
  };
}

/**
 * strict на общем автомате. Со скобками (нужен guard).
 *
 * Смысл strict существует только здесь: залипшую ошибку можно снять
 * либо соседом-retry на том же guard'е, либо явным guard.reset().
 * Без внешнего guard'а strict не имеет механизма восстановления
 * и потому в API отсутствует.
 */
export function SingleGuardedStrict(guard: ExecutionGuard) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor): void {
    descriptor.value = createGuardedRunner(descriptor.value, guard, "strict");
  };
}

/**
 * ttl на общем автомате. Со скобками (нужны guard и ms).
 * Явный сброс возможен через guard.reset().
 */
export function SingleGuardedTTL(guard: ExecutionGuard, ttl: number) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor): void {
    descriptor.value = createGuardedRunner(descriptor.value, guard, "ttl", ttl);
  };
}
