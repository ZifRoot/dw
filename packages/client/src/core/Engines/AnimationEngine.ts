import { DoublyLinkedList, DoublyLinkedListNode } from "@utils/doubly-linked-list";

export type AnimationCallback = (deltaTime: number) => void | Promise<void>;

/** Источник callback'ов, создаваемый Generator API. */
export interface AnimationGenerator extends Iterator<AnimationCallback> {}

/** Фабрика, создающая новый Generator для следующего прохода. */
export type AnimationGeneratorFactory = () => AnimationGenerator;

/** Последовательность callback'ов, которую можно перезапустить. */
export interface Sequence<T> extends Iterator<T> {
  /**
   * Завершить текущий проход и подготовить следующий.
   *
   * Возвращает true, если последовательность может быть запущена снова.
   */
  reset(): boolean;
}

/** Дополнительные параметры повторяемой последовательности. */
export interface SequenceOptions {
  /** Выполнить последовательность только один раз. */
  oneShot?: boolean;
}

class ArraySequence implements Sequence<AnimationCallback> {
  private cursor = 0;

  public constructor(
    private readonly callbacks: AnimationCallback[],
    private readonly oneShot = false,
  ) {}

  public next(): IteratorResult<AnimationCallback> {
    if (this.cursor >= this.callbacks.length) {
      return { done: true, value: undefined };
    }

    const callback = this.callbacks[this.cursor];
    this.cursor++;
    return { done: false, value: callback };
  }

  public reset(): boolean {
    if (this.oneShot || this.callbacks.length === 0) return false;
    this.cursor = 0;
    return true;
  }

  public remove(callback: AnimationCallback): boolean {
    const index = this.callbacks.indexOf(callback);
    if (index < 0) return false;

    this.callbacks.splice(index, 1);

    if (index < this.cursor) {
      this.cursor--;
    }

    return true;
  }
}

/** Обёртка над уже созданным Generator. Generator по определению одноразовый. */
class GeneratorSequence implements Sequence<AnimationCallback> {
  public constructor(private readonly generator: AnimationGenerator) {}

  public next(): IteratorResult<AnimationCallback> {
    return this.generator.next();
  }

  public reset(): boolean {
    return false;
  }
}

/** Последовательность, создающая новый Generator для каждого нового прохода. */
class GeneratorFactorySequence implements Sequence<AnimationCallback> {
  private generator: AnimationGenerator | null = null;

  public constructor(
    private readonly factory: AnimationGeneratorFactory,
    private readonly oneShot = false,
  ) {}

  public next(): IteratorResult<AnimationCallback> {
    if (this.generator === null) {
      this.generator = this.factory();
    }

    return this.generator.next();
  }

  public reset(): boolean {
    if (this.oneShot) return false;
    this.generator = null;
    return true;
  }
}

interface CallbackGroup {
  groupId: number;
  sequence: Sequence<AnimationCallback>;
  lastCompletedAt: number | null;
  queueNode: DoublyLinkedListNode<CallbackGroup> | null;
  eligibleStep: number;
  waitingPromise: Promise<void> | null;
}

const CALIBRATION_FRAMES = 5;
const COMPUTATION_BUDGET_RATIO = 0.8;

export class AnimationEngine {
  private frameBudgetMs: number | null = null;
  private rafId: number | null = null;
  private isRunning = false;
  private isCalibrating: "no" | "process" | "yes" = "no";
  private isStepping = false;
  private currentStep = 0;
  private nextGroupId = 0;
  private groups = new Map<number, CallbackGroup>();
  private pendingGroups = new DoublyLinkedList<CallbackGroup>();
  private startedGroups = new DoublyLinkedList<CallbackGroup>();

  constructor() {}

  /** Добавить один callback как отдельную группу. */
  public addCallback(callback: AnimationCallback, options: SequenceOptions = {}): () => void {
    return this.addCallbacks([callback], options);
  }

  /** Добавить последовательную группу callback'ов. */
  public addCallbacks(callbacks: AnimationCallback[], options: SequenceOptions = {}): () => void {
    if (callbacks.length === 0) return () => {};

    return this.addGroup(new ArraySequence([...callbacks], options.oneShot === true));
  }

  /** Добавить существующий Generator как отдельную группу. */
  public addGenerator(generator: AnimationGenerator): () => void {
    return this.addGroup(new GeneratorSequence(generator));
  }

  /** Добавить фабрику Generator как повторяемую последовательность. */
  public addGeneratorFactory(factory: AnimationGeneratorFactory, options: SequenceOptions = {}): () => void {
    return this.addGroup(new GeneratorFactorySequence(factory, options.oneShot === true));
  }

  private addGroup(sequence: Sequence<AnimationCallback>): () => void {
    const groupId = this.nextGroupId++;

    const group: CallbackGroup = {
      groupId,
      sequence,
      lastCompletedAt: null,
      waitingPromise: null,
      queueNode: null,
      eligibleStep: this.currentStep + (this.isStepping ? 1 : 0),
    };

    this.groups.set(groupId, group);
    this.enqueuePending(group);
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
    for (const [groupId, group] of this.groups) {
      const sequence = group.sequence;
      if (!(sequence instanceof ArraySequence)) continue;
      if (!sequence.remove(callback)) continue;

      return;
    }
  }

  private removeGroup(groupId: number): void {
    const group = this.groups.get(groupId);
    if (group === undefined) return;

    this.removeFromQueue(group);

    this.groups.delete(groupId);

    if (this.groups.size === 0) this.stop();
  }

  private start(): void {
    if (this.groups.size === 0) return;

    if (this.isRunning) {
      if (this.rafId === null && this.hasQueuedGroups()) {
        this.scheduleStep();
      }
      return;
    }

    if (!this.calibrate()) return;

    this.isRunning = true;
    this.enqueueReadyGroups();

    if (this.hasQueuedGroups()) {
      this.scheduleStep();
    }
  }

  private enqueueReadyGroups(): void {
    for (const group of this.groups.values()) {
      if (group.queueNode !== null || group.waitingPromise !== null) continue;

      if (group.lastCompletedAt === null) {
        this.enqueuePending(group);
      } else {
        this.enqueueStarted(group);
      }
    }
  }

  private enqueuePending(group: CallbackGroup): void {
    group.queueNode = this.pendingGroups.append(group);
  }

  private enqueueStarted(group: CallbackGroup): void {
    group.queueNode = this.startedGroups.append(group);
  }

  private removeFromQueue(group: CallbackGroup): void {
    if (group.queueNode === null) return;

    if (group.queueNode.belongsTo(this.pendingGroups)) {
      this.pendingGroups.remove(group.queueNode);
    } else if (group.queueNode.belongsTo(this.startedGroups)) {
      this.startedGroups.remove(group.queueNode);
    }

    group.queueNode = null;
  }

  private hasQueuedGroups(): boolean {
    return this.pendingGroups.size > 0 || this.startedGroups.size > 0;
  }

  private scheduleStep(): void {
    this.rafId = requestAnimationFrame((timestamp) => this.step(timestamp));
  }

  private calibrate(): boolean {
    if (this.isCalibrating === "yes") return true;
    if (this.isCalibrating === "process") return false;

    this.isCalibrating = "process";

    let previousTimestamp: number | null = null;
    let totalFrameTime = 0;
    let measuredFrames = 0;

    const measure = (timestamp: number): void => {
      this.rafId = null;
      if (this.isCalibrating !== "process") return;

      if (previousTimestamp !== null) {
        totalFrameTime += timestamp - previousTimestamp;
        measuredFrames++;
      }

      previousTimestamp = timestamp;

      if (measuredFrames < CALIBRATION_FRAMES - 1) {
        this.rafId = requestAnimationFrame(measure);
        return;
      }

      this.frameBudgetMs = Math.max(1, (totalFrameTime / measuredFrames) * COMPUTATION_BUDGET_RATIO);
      this.isCalibrating = "yes";
      this.start();
    };

    this.rafId = requestAnimationFrame(measure);
    return false;
  }

  /**
   * Выполнить один кадр.
   *
   * Группы конкурируют между собой. Новые группы получают первый запуск
   * в порядке регистрации. После первого callback группа возвращается
   * в конкуренцию по времени последнего завершения callback.
   */
  public step(timestamp = performance.now()): void {
    if (!this.isRunning || this.frameBudgetMs === null) return;

    this.rafId = null;
    this.currentStep++;
    this.isStepping = true;

    try {
      const frameStart = performance.now();
      let executedCallbacks = 0;

      while (this.isRunning && this.groups.size > 0 && (executedCallbacks === 0 || performance.now() - frameStart < this.frameBudgetMs)) {
        const group = this.takeNextGroup();
        if (group === null) break;

        if (!this.executeGroupCallback(group)) {
          continue;
        }

        executedCallbacks++;
      }
    } finally {
      this.isStepping = false;
    }

    if (this.isRunning && this.hasQueuedGroups()) {
      this.scheduleStep();
    }
  }

  private takeOldestStartedGroup(): DoublyLinkedListNode<CallbackGroup> | null {
    let selected: DoublyLinkedListNode<CallbackGroup> | null = null;
    let selectedTime = Infinity;

    for (let node = this.startedGroups.first; node !== null; node = node.next) {
      const completedAt = node.value.lastCompletedAt ?? Infinity;
      if (completedAt < selectedTime) {
        selected = node;
        selectedTime = completedAt;
      }
    }

    return selected;
  }

  private takeNextGroup(): CallbackGroup | null {
    const pendingNode = this.pendingGroups.first;

    if (pendingNode !== null && pendingNode.value.eligibleStep <= this.currentStep) {
      this.pendingGroups.remove(pendingNode);
      pendingNode.value.queueNode = null;
      return pendingNode.value;
    }

    const startedNode = this.takeOldestStartedGroup();
    if (startedNode === null) return null;

    this.startedGroups.remove(startedNode);
    startedNode.value.queueNode = null;
    return startedNode.value;
  }

  private executeGroupCallback(group: CallbackGroup): boolean {
    const next = this.getNextCallback(group);

    if (next.done) {
      if (!group.sequence.reset()) {
        this.removeGroup(group.groupId);
      } else {
        group.eligibleStep = this.currentStep + 1;
        this.enqueuePending(group);
      }

      return false;
    }

    const startedAt = performance.now();
    const deltaTime = group.lastCompletedAt === null ? 0 : Math.max(0, startedAt - group.lastCompletedAt);
    const result = this.executeSafely(next.value, deltaTime);

    if (!this.groups.has(group.groupId)) return true;

    if (result instanceof Promise) {
      group.waitingPromise = result;
      result.then(
        () => this.completeAsyncCallback(group.groupId, result),
        (error) => this.failAsyncCallback(group.groupId, result, error),
      );
      return true;
    }

    group.lastCompletedAt = performance.now();
    this.enqueueStarted(group);

    return true;
  }

  private completeAsyncCallback(groupId: number, promise: Promise<void>): void {
    const group = this.groups.get(groupId);
    if (group === undefined || group.waitingPromise !== promise) return;

    group.waitingPromise = null;
    group.lastCompletedAt = performance.now();

    if (this.isRunning) {
      this.enqueueStarted(group);
      if (this.rafId === null) this.scheduleStep();
    }
  }

  private failAsyncCallback(groupId: number, promise: Promise<void>, error: unknown): void {
    const group = this.groups.get(groupId);
    if (group === undefined || group.waitingPromise !== promise) return;

    console.error("AnimationEngine callback failed", error);
    this.removeGroup(groupId);
  }

  private getNextCallback(group: CallbackGroup): IteratorResult<AnimationCallback> {
    try {
      return group.sequence.next();
    } catch (error) {
      console.error("AnimationEngine sequence failed", error);
      return { done: true, value: undefined };
    }
  }

  private executeSafely(callback: AnimationCallback, deltaTime: number): void | Promise<void> {
    try {
      return callback(deltaTime);
    } catch (error) {
      console.error("AnimationEngine callback failed", error);
      return undefined;
    }
  }

  public stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.isRunning = false;
    this.frameBudgetMs = null;
    this.isCalibrating = "no";
    this.isStepping = false;
  }

  public clear(): void {
    this.groups.clear();
    // Группы хранятся в одной очереди с двумя логическими участками.
    this.pendingGroups.clear();
    this.startedGroups.clear();
    this.currentStep = 0;
    this.stop();
  }
}
