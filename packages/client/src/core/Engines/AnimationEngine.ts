export type AnimationCallback = (deltaTime: number) => void;

interface GroupQueueNode {
  groupId: number;
  previous: GroupQueueNode | null;
  next: GroupQueueNode | null;
  queue: GroupQueue | null;
}

class GroupQueue {
  private head: GroupQueueNode | null = null;
  private tail: GroupQueueNode | null = null;

  public enqueue(node: GroupQueueNode): void {
    if (node.queue !== null) throw new Error("Group queue node is already queued");

    node.previous = this.tail;
    node.next = null;
    node.queue = this;

    if (this.tail === null) this.head = node;
    else this.tail.next = node;

    this.tail = node;
  }

  public dequeue(): GroupQueueNode | null {
    const node = this.head;
    if (node === null) return null;
    this.remove(node);
    return node;
  }

  public peek(): GroupQueueNode | null {
    return this.head;
  }

  public remove(node: GroupQueueNode): void {
    if (node.queue !== this) return;

    if (node.previous === null) this.head = node.next;
    else node.previous.next = node.next;

    if (node.next === null) this.tail = node.previous;
    else node.next.previous = node.previous;

    node.previous = null;
    node.next = null;
    node.queue = null;
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
  }
}

interface CallbackGroup {
  callbacks: number[];
  cursor: number;
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
  private nextCallbackId = 0;
  private nextGroupId = 0;
  private lastFrameTime: number | null = null;
  private callbacks = new Map<number, AnimationCallback>();
  private groups = new Map<number, CallbackGroup>();
  private pendingGroups = new GroupQueue();
  private startedGroups = new GroupQueue();

  constructor() {}

  /** Добавить один callback как отдельную группу. */
  public addCallback(callback: AnimationCallback): () => void {
    return this.addCallbacks([callback]);
  }

  /** Добавить последовательную группу callback'ов. */
  public addCallbacks(callbacks: AnimationCallback[]): () => void {
    if (callbacks.length === 0) return () => {};

    const groupId = this.nextGroupId++;
    const callbackIds: number[] = [];

    for (const callback of callbacks) {
      const id = this.nextCallbackId++;
      this.callbacks.set(id, callback);
      callbackIds.push(id);
    }

    const group: CallbackGroup = {
      callbacks: callbackIds,
      cursor: 0,
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
    this.pendingGroups.enqueue(group.node);
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
    for (const group of this.groups.values()) {
      const callbackId = group.callbacks.find(
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
      const index = group.callbacks.indexOf(id);
      if (index < 0) continue;

      group.callbacks.splice(index, 1);
      if (index < group.cursor) group.cursor--;

      if (group.callbacks.length === 0) this.removeGroup(groupId);
      else if (group.cursor >= group.callbacks.length) group.cursor = 0;

      return;
    }
  }

  private removeGroup(groupId: number): void {
    const group = this.groups.get(groupId);
    if (group === undefined) return;

    this.pendingGroups.remove(group.node);
    this.startedGroups.remove(group.node);

    for (const callbackId of group.callbacks) {
      this.callbacks.delete(callbackId);
    }

    this.groups.delete(groupId);

    if (this.groups.size === 0) this.stop();
  }

  private start(): void {
    if (this.isRunning || this.callbacks.size === 0) return;
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

        this.executeGroupCallback(group);
        executedCallbacks++;
      }
    } finally {
      this.isStepping = false;
    }

    this.lastFrameTime = timestamp;

    if (this.isRunning && this.callbacks.size > 0) {
      this.scheduleStep();
    }
  }

  private takeNextGroup(): CallbackGroup | null {
    const pendingNode = this.pendingGroups.peek();

    if (
      pendingNode !== null &&
      (this.groups.get(pendingNode.groupId)?.eligibleStep ?? Infinity) <=
        this.currentStep
    ) {
      this.pendingGroups.dequeue();
      return this.groups.get(pendingNode.groupId) ?? null;
    }

    const startedNode = this.startedGroups.dequeue();
    if (startedNode === null) return null;

    return this.groups.get(startedNode.groupId) ?? null;
  }

  private executeGroupCallback(group: CallbackGroup): void {
    if (group.callbacks.length === 0) {
      this.removeGroup(group.node.groupId);
      return;
    }

    if (group.cursor >= group.callbacks.length) group.cursor = 0;

    const callbackId = group.callbacks[group.cursor];
    group.cursor = (group.cursor + 1) % group.callbacks.length;

    const callback = this.callbacks.get(callbackId);
    if (callback === undefined) {
      this.removeCallbackById(callbackId);
      return;
    }

    const startedAt = performance.now();
    const deltaTime =
      group.lastCompletedAt === null
        ? 0
        : Math.max(0, startedAt - group.lastCompletedAt);

    this.executeSafely(callback, deltaTime);

    if (!this.groups.has(group.node.groupId)) return;

    group.lastCompletedAt = performance.now();
    this.startedGroups.enqueue(group.node);
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
    this.callbacks.clear();
    this.groups.clear();
    this.pendingGroups.clear();
    this.startedGroups.clear();
    this.currentStep = 0;
    this.stop();
  }
}
