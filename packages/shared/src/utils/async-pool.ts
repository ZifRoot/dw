/**
 * Ограничивает количество одновременно выполняющихся асинхронных задач.
 *
 * AsyncPool ограничивает именно параллелизм: все задачи не создаются
 * одновременно, следующая задача запускается только после освобождения
 * рабочего слота.
 */
export class AsyncPool {
  /**
   * Максимальное количество задач, выполняющихся одновременно.
   */
  public readonly concurrency: number;

  /**
   * @param concurrency Максимальное количество одновременно выполняющихся задач.
   * Должно быть положительным целым числом.
   */
  public constructor(concurrency: number) {
    if (!Number.isInteger(concurrency) || concurrency <= 0) {
      throw new RangeError("concurrency must be a positive integer");
    }

    this.concurrency = concurrency;
  }

  /**
   * Выполняет задачи с ограничением параллелизма.
   *
   * Порядок результатов соответствует порядку входных задач.
   * Если одна из задач завершается ошибкой, метод завершается с этой
   * ошибкой после того, как она станет известна. Уже запущенные задачи
   * не отменяются.
   *
   * @param tasks Функции, возвращающие асинхронные задачи.
   */
  public async run<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
    if (tasks.length === 0) {
      return [];
    }

    const results = new Array<T>(tasks.length);
    let nextIndex = 0;

    const worker = async (): Promise<void> => {
      while (true) {
        const index = nextIndex++;

        if (index >= tasks.length) {
          return;
        }

        results[index] = await tasks[index]();
      }
    };

    const workerCount = Math.min(this.concurrency, tasks.length);

    await Promise.all(
      Array.from({ length: workerCount }, () => worker()),
    );

    return results;
  }
}
