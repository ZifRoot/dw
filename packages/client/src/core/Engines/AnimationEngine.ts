export type AnimationCallback = (deltaTime: number) => void;

/** Источник callback'ов для одной группы AnimationEngine. */
export interface AnimationGenerator extends Iterator<AnimationCallback> {}

/** Фабрика, создающая источник callback'ов для группы. */
export type AnimationGeneratorFactory = () => AnimationGenerator;

interface CallbackSequence extends AnimationGenerator {
  remove(callback: AnimationCallback): boolean;
  isEmpty(): boolean;
}

class ArrayCallbackSequence implements CallbackSequence {
  private cursor = 0;

  public constructor(private readonly callbacks: AnimationCallback[]) {}

  public next(): IteratorResult<AnimationCallback> {
    if (this.callbacks.length === 0) {
      return { done: true, value: undefined };
    }

    if (this.cursor >= this.callbacks.length) {
      this.cursor = 0;
    }

    const callback = this.callbacks[this.cursor];
    this.cursor = (this.cursor + 1) % this.callbacks.length;

    return { done: false, value: callback };
  }

  public remove(callback: AnimationCallback): boolean {
    const index = this.callbacks.indexOf(callback);
    if (index < 0) return false;

    this.callbacks.splice(index, 1);

    if (index < this.cursor) {
      this.cursor--;
    }

    if (this.cursor >= this.callbacks.length) {
      this.cursor = 0;
    }

    return true;
  }

  public isEmpty(): boolean {
    return this.callbacks.length === 0;
  }
}

interface GroupQueueNode {
  groupId: number;
  previous: GroupQueueNode | null;
  next: GroupQueueNode | null;
  queue: GroupQueue | null;
}

class GroupQueue {
  private head: GroupQueueNode | null = null;
  private tail: GroupQueueNode | null = null;
  private startedHead: GroupQueueNode | null = null;
  private pendingTail: GroupQueueNode | null = null;
  private count = 0;

  public get size(): number {
    return this.count;
  }

  /**
   * Добавить никогда не запускавшуюся группу перед уже запущенными.
   *
   * Очередь логически разделена на два участка:
   * [pending groups] -> [started groups].
   */
  public enqueuePending(node: GroupQueueNode): void {
    if (node.queue !== null) {
      throw new Error("Group queue node is already queued");
    }

    node.queue = this;
    node.next = this.startedHead;

    if (this.startedHead === null) {
      node.previous = this.tail;

      if (this.tail === null) this.head = node;
      else this.tail.next = node;

      this.tail = node;
    } else {
      node.previous = this.startedHead.previous;

      if (node.previous === null) this.head = node;
      else node.previous.next = node;

      this.startedHead.previous = node;
    }

    this.pendingTail = node;
    this.count++;
  }

  /** Добавить завершившую callback работу группу в конец started-участка. */
  public enqueueStarted(node: GroupQueueNode): void {
    if (node.queue !== null) {
      throw new Error("Group queue node is already queued");
    }

    node.previous = this.tail;
    node.next = null;
    node.queue = this;

    if (this.tail === null) {
      this.head = node;
      this.startedHead = node;
    } else {
      this.tail.next = node;
      if (this.startedHead === null) this.startedHead = node;
    }

    this.tail = node;
    this.count++;
  }

  /** Взять первую никогда не запускавшуюся группу. */
  public dequeuePending(): GroupQueueNode | null {
    if (this.head === null || this.head === this.startedHead) return null;

    const node = this.head;
    this.remove(node);
    return node;
  }

  /** Взять старейшую уже запускавшуюся группу. */
  public dequeueStarted(): GroupQueueNode | null {
    const node = this.startedHead;
    if (node === null) return null;

    this.remove(node);
    return node;
  }

  public peekPending(): GroupQueueNode | null {
    if (this.head === this.startedHead) return null;
    return this.head;
  }

  public remove(node: GroupQueueNode): void {
    if (node.queue !== this) return;

    const wasStarted = node === this.startedHead;

    if (node.previous === null) this.head = node.next;
    else node.previous.next = node.next;

    if (node.next === null) this.tail = node.previous;
    else node.next.previous = node.previous;

    if (wasStarted) {
      this.startedHead = node.next;
    }

    if (this.pendingTail === node) {
      this.pendingTail = node.previous;
    }

    if (this.startedHead === null) {
      this.pendingTail = this.tail;
    }

    node.previous = null;
    node.next = null;
    node.queue = null;
    this.count--;
  }

  public clear(): void {
    let node = this.head;

    while (node !== null) {
      const next = node.next;
      node.previous = null;
      node.next = null;
      node.queue = null;
      node = next;
    }

    this.head = null;
    this.tail = null;
    this.startedHead = null;
    this.pendingTail = null;
    this.count = 0;
  }
}

interface CallbackGroup {
  sequence: CallbackSequence | null;
  generator: AnimationGenerator | null;
  generatorFactory: AnimationGeneratorFactory | null;
  lastCompletedAt: number | null;
  node: GroupQueueNode;
  eligibleStep: number;
}

const CALIBRATION_FRAMES = 5;
const COMPUTATION_BUDGET_RATIO = 0.8;

export class AnimationEngine {
  private frameBudgetMs: number | null = null;
  private rafId: number | null = null;
  private calibrationRafId: number | null = null;
  private isRunning = false;
  private isCalibrating: "no" | "process" | "yes" = "no";
  private isStepping = false;
  private currentStep = 0;
  private nextGroupId = 0;
  private lastFrameTime: number | null = null;
  private groups = new Map<number, CallbackGroup>();
  private groupsQueue = new GroupQueue();

  constructor() {}

  /** Добавить один callback как отдельную группу. */
  public addCallback(callback: AnimationCallback): () => void {
    return this.addCallbacks([callback]);
  }

  /** Добавить последовательную группу callback'ов. */
  public addCallbacks(callbacks: AnimationCallback[]): () => void {
    if (callbacks.length === 0) return () => {};

    return this.addGroup({
      sequence: new ArrayCallbackSequence([...callbacks]),
      generator: null,
      generatorFactory: null,
    });
  }

  /** Добавить существующий Generator как отдельную группу. */
  public addGenerator(generator: AnimationGenerator): () => void {
    return this.addGroup({
      sequence: null,
      generator,
      generatorFactory: null,
    });
  }

  /**
   * Добавить фабрику Generator.
   *
   * Новый Generator создаётся при первом обращении группы в каждом кадре.
   * После завершения Generator группа остаётся зарегистрированной и
   * продолжает работу со следующим Generator в следующем кадре.
   */
  public addGeneratorFactory(factory: AnimationGeneratorFactory): () => void {
    return this.addGroup({
      sequence: null,
      generator: null,
      generatorFactory: factory,
    });
  }

  private addGroup(source: {
    sequence: CallbackSequence | null;
    generator: AnimationGenerator | null;
    generatorFactory: AnimationGeneratorFactory | null;
  }): () => void {
    const groupId = this.nextGroupId++;

    const group: CallbackGroup = {
      sequence: source.sequence,
      generator: source.generator,
      generatorFactory: source.generatorFactory,
      lastCompletedAt: null,
      node: {
        groupId,
        previous: null,
        next: null,
        queue: null,
      },
      eligibleStep: this.currentStep + (this.isStepping ? 1 : 0),
    };

    this.groups.set(groupId, group);
    this.groupsQueue.enqueuePending(group.node);
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
      if (group.sequence === null) continue;
      if (!group.sequence.remove(callback)) continue;

      if (group.sequence.isEmpty()) {
        this.removeGroup(groupId);
      }

      return;
    }
  }

  private removeGroup(groupId: number): void {
    const group = this.groups.get(groupId);
    if (group === undefined) return;

    this.groupsQueue.remove(group.node);

    this.groups.delete(groupId);

    if (this.groups.size === 0) this.stop();
  }

  private start(): void {
    if (this.isRunning || this.groups.size === 0) return;
    if (!this.calibrate()) return;

    this.isRunning = true;
    this.lastFrameTime = null;
    this.scheduleStep();
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
      this.calibrationRafId = null;
      if (this.isCalibrating !== "process") return;

      if (previousTimestamp !== null) {
        totalFrameTime += timestamp - previousTimestamp;
        measuredFrames++;
      }

      previousTimestamp = timestamp;

      if (measuredFrames < CALIBRATION_FRAMES - 1) {
        this.calibrationRafId = requestAnimationFrame(measure);
        return;
      }

      this.frameBudgetMs = Math.max(
        1,
        (totalFrameTime / measuredFrames) * COMPUTATION_BUDGET_RATIO,
      );
      this.isCalibrating = "yes";
      this.start();
    };

    this.calibrationRafId = requestAnimationFrame(measure);
    return false;
  }

  /**
   * Выполнить один кадр.
   *
   * Группы конкурируют между собой. Сначала обслуживаются никогда
   * не запускавшиеся группы в порядке регистрации, затем группы
   * в порядке времени последнего завершения callback.
   */
  public step(timestamp = performance.now()): void {
    if (!this.isRunning || this.frameBudgetMs === null) return;

    this.rafId = null;
    this.currentStep++;
    this.isStepping = true;

    try {
      const frameStart = performance.now();
      let executedCallbacks = 0;

      while (
        this.isRunning &&
        this.groups.size > 0 &&
        (executedCallbacks === 0 ||
          performance.now() - frameStart < this.frameBudgetMs)
      ) {
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

    this.lastFrameTime = timestamp;

    if (this.isRunning && this.groups.size > 0) {
      this.scheduleStep();
    }
  }

  private takeNextGroup(): CallbackGroup | null {
    const pendingNode = this.groupsQueue.peekPending();

    if (
      pendingNode !== null &&
      (this.groups.get(pendingNode.groupId)?.eligibleStep ?? Infinity) <=
        this.currentStep
    ) {
      this.groupsQueue.dequeuePending();
      return this.groups.get(pendingNode.groupId) ?? null;
    }

    const startedNode = this.groupsQueue.dequeueStarted();
    if (startedNode === null) return null;

    return this.groups.get(startedNode.groupId) ?? null;
  }

  private executeGroupCallback(group: CallbackGroup): boolean {
    const next = this.getNextCallback(group);

    if (next.done) {
      if (group.generatorFactory === null) {
        this.removeGroup(group.node.groupId);
      } else {
        group.generator = null;
        group.eligibleStep = this.currentStep + 1;
        this.groupsQueue.enqueueStarted(group.node);
      }

      return false;
    }

    const startedAt = performance.now();
    const deltaTime =
      group.lastCompletedAt === null
        ? 0
        : Math.max(0, startedAt - group.lastCompletedAt);

    this.executeSafely(next.value, deltaTime);

    if (!this.groups.has(group.node.groupId)) return true;

    group.lastCompletedAt = performance.now();
    this.startedGroups.enqueue(group.node);

    return true;
  }

  private getNextCallback(
    group: CallbackGroup,
  ): IteratorResult<AnimationCallback> {
    if (group.sequence !== null) {
      return group.sequence.next();
    }

    if (group.generator === null) {
      if (group.generatorFactory === null) {
        throw new Error("Animation group has no callback source");
      }

      try {
        group.generator = group.generatorFactory();
      } catch (error) {
        console.error("AnimationEngine generator factory failed", error);
        group.generator = null;
        return { done: true, value: undefined };
      }
    }

    try {
      return group.generator.next();
    } catch (error) {
      console.error("AnimationEngine generator failed", error);

      if (group.generatorFactory === null) {
        this.removeGroup(group.node.groupId);
      } else {
        group.generator = null;
        group.eligibleStep = this.currentStep + 1;
        this.startedGroups.enqueue(group.node);
      }

      return { done: true, value: undefined };
    }
  }

  private executeSafely(callback: AnimationCallback, deltaTime: number): void {
    try {
      callback(deltaTime);
    } catch (error) {
      console.error("AnimationEngine callback failed", error);
    }
  }

  public stop(): void {
    if (this.calibrationRafId !== null) {
      cancelAnimationFrame(this.calibrationRafId);
      this.calibrationRafId = null;
    }

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.isRunning = false;
    this.lastFrameTime = null;
    this.frameBudgetMs = null;
    this.isCalibrating = "no";
    this.isStepping = false;
  }

  public clear(): void {
    this.groups.clear();
    // Группы хранятся в одной очереди с двумя логическими участками.
    this.groupsQueue.clear();
    this.currentStep = 0;
    this.stop();
  }
}
