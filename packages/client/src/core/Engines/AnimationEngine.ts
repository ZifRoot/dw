export type AnimationCallback = (deltaTime: number) => void;

interface CallbackGroup {
  order: number[];
  cursor: number;
}

const CALIBRATION_FRAMES = 5;
const COMPUTATION_BUDGET_RATIO = 0.8;

/**
 * Планировщик фоновых работ на requestAnimationFrame.
 *
 * AnimationEngine не знает ничего о назначении зарегистрированных колбэков.
 * Он только запускает их с учётом временного бюджета кадра и распределяет
 * работу по независимым последовательностям (группам).
 *
 * Перед запуском планировщика двигатель измеряет реальный интервал между
 * кадрами и использует 80% среднего интервала как бюджет вычислений.
 */
export class AnimationEngine {
  private frameBudgetMs: number | null = null;
  private rafId: number | null = null;
  private isRunning = false;
  private isCalibrating: "no" | "process" | "yes" = "no";
  private nextCallbackId = 0;
  private nextGroupId = 0;
  private groupCursor = 0;
  private lastFrameTime: number | null = null;
  private callbacks = new Map<number, AnimationCallback>();
  private groups = new Map<number, CallbackGroup>();
  private groupOrder: number[] = [];

  constructor() {}

  /**
   * Добавить один callback как отдельную последовательную группу.
   * Возвращает disposer, удаляющий именно эту регистрацию.
   */
  public addCallback(callback: AnimationCallback): () => void {
    return this.addCallbacks([callback]);
  }

  /**
   * Добавить последовательную группу callback'ов.
   *
   * Callback'и внутри группы выполняются в зарегистрированном порядке.
   * Разные группы планируются независимо.
   */
  public addCallbacks(callbacks: AnimationCallback[]): () => void {
    if (callbacks.length === 0) return () => {};

    const groupId = this.nextGroupId++;
    const order: number[] = [];

    for (const callback of callbacks) {
      const id = this.nextCallbackId++;
      this.callbacks.set(id, callback);
      order.push(id);
    }

    this.groups.set(groupId, {
      order,
      cursor: 0,
    });
    this.groupOrder.push(groupId);

    this.start();

    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this.removeGroup(groupId);
    };
  }

  /** Удалить первую регистрацию указанного callback. */
  public removeCallback(callback: AnimationCallback): void {
    for (const groupId of this.groupOrder) {
      const group = this.groups.get(groupId);
      if (!group) continue;

      const callbackId = group.order.find(
        (id) => this.callbacks.get(id) === callback,
      );

      if (callbackId !== undefined) {
        this.removeCallbackById(callbackId);
        return;
      }
    }
  }

  private removeCallbackById(id: number): void {
    if (!this.callbacks.delete(id)) return;

    for (const [groupId, group] of this.groups) {
      const index = group.order.indexOf(id);
      if (index < 0) continue;

      group.order.splice(index, 1);
      if (index < group.cursor) group.cursor--;

      if (group.order.length === 0) {
        this.removeGroup(groupId);
      } else if (group.cursor >= group.order.length) {
        group.cursor = 0;
      }

      return;
    }
  }

  private removeGroup(groupId: number): void {
    const group = this.groups.get(groupId);
    if (!group) return;

    for (const id of group.order) {
      this.callbacks.delete(id);
    }

    this.groups.delete(groupId);

    const index = this.groupOrder.indexOf(groupId);
    if (index >= 0) {
      this.groupOrder.splice(index, 1);
      if (index < this.groupCursor) this.groupCursor--;

      if (this.groupCursor >= this.groupOrder.length) {
        this.groupCursor = 0;
      }
    }

    if (this.groups.size === 0) this.stop();
  }

  private start(): void {
    if (this.isRunning) return;
    if (this.callbacks.size === 0) return;
    if (!this.calibrate()) return;
    this.isRunning = true;
    this.lastFrameTime = null;
    this.scheduleStep();
  }

  private scheduleStep(): void {
    this.rafId = requestAnimationFrame((timestamp) => this.step(timestamp));
  }

  private calibrate(): boolean {
    if (this.isCalibrating == "yes") return true;
    if (this.isCalibrating == "process") return false;
    this.isCalibrating = "process";

    let previousTimestamp: number | null = null;
    let totalFrameTime = 0;
    let measuredFrames = 0;

    const measure = (timestamp: number): void => {
      if (previousTimestamp !== null) {
        totalFrameTime += timestamp - previousTimestamp;
        measuredFrames++;
      }

      previousTimestamp = timestamp;

      if (measuredFrames < CALIBRATION_FRAMES - 1) {
        requestAnimationFrame(measure);
        return;
      }

      this.frameBudgetMs = Math.max(
        1,
        (totalFrameTime / measuredFrames) * COMPUTATION_BUDGET_RATIO,
      );
      this.isCalibrating = "yes";
      this.start();
    };

    requestAnimationFrame(measure);
    return false;
  }

  /**
   * Выполнить один кадр планировщика.
   *
   * В начале кадра фиксируется список существующих групп и количество
   * callback-позиций в каждой группе. Поэтому новые группы и новые callback'и
   * не получают слот в уже начатом проходе.
   */
  public step(timestamp = performance.now()): void {
    if (!this.isRunning || this.frameBudgetMs === null) return;
    this.rafId = null;

    const deltaTime =
      this.lastFrameTime === null ? 0 : timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;

    const frameStart = performance.now();
    const groupIds = this.getGroupIdsFromCursor();
    const remaining = new Map<number, number>();

    for (const groupId of groupIds) {
      const group = this.groups.get(groupId);
      if (group) remaining.set(groupId, group.order.length);
    }

    let executedCallbacks = 0;

    while (
      this.groups.size > 0 &&
      this.hasRemainingCallbacks(groupIds, remaining) &&
      (executedCallbacks === 0 ||
        performance.now() - frameStart < this.frameBudgetMs)
    ) {
      let executed = false;

      for (const groupId of groupIds) {
        const remainingCallbacks = remaining.get(groupId) ?? 0;
        if (remainingCallbacks <= 0) continue;

        remaining.set(groupId, remainingCallbacks - 1);

        const group = this.groups.get(groupId);
        if (!group || group.order.length === 0) continue;

        if (group.cursor >= group.order.length) group.cursor = 0;

        const callbackId = group.order[group.cursor];
        group.cursor = (group.cursor + 1) % group.order.length;

        const callback = this.callbacks.get(callbackId);
        if (!callback) continue;

        this.moveGroupCursorAfter(groupId);
        callback(deltaTime);
        executed = true;
        executedCallbacks++;

        if (
          !this.isRunning ||
          this.groups.size === 0 ||
          performance.now() - frameStart >= this.frameBudgetMs
        ) {
          break;
        }
      }

      if (!executed) break;
    }

    if (this.isRunning && this.callbacks.size > 0) {
      this.scheduleStep();
    }
  }

  private getGroupIdsFromCursor(): number[] {
    const groupIds: number[] = [];
    const count = this.groupOrder.length;

    for (let offset = 0; offset < count; offset++) {
      groupIds.push(
        this.groupOrder[(this.groupCursor + offset) % count],
      );
    }

    return groupIds;
  }

  private hasRemainingCallbacks(
    groupIds: number[],
    remaining: Map<number, number>,
  ): boolean {
    return groupIds.some((groupId) => (remaining.get(groupId) ?? 0) > 0);
  }

  private moveGroupCursorAfter(groupId: number): void {
    const index = this.groupOrder.indexOf(groupId);
    if (index < 0 || this.groupOrder.length === 0) return;

    this.groupCursor = (index + 1) % this.groupOrder.length;
  }

  public stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.isRunning = false;
    this.lastFrameTime = null;
  }

  public clear(): void {
    this.callbacks.clear();
    this.groups.clear();
    this.groupOrder.length = 0;
    this.groupCursor = 0;
    this.stop();
  }
}
