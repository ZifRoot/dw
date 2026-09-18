// PointsSceneTester.ts
import { AppMediator } from "./AppMediator";
import { PointGraphManager } from "./collections/PointGraphManager";
import { EdgeRef } from "./models/EdgeRef";
import { PointMath } from "./models/PointMath";
import { Safe } from "@utils/logger";
import { Point } from "./models/Point";

interface TestConfig {
  /** Доля точек, которые перемещаются на каждой итерации (0-1). */
  updateFrationRange?: [number, number];
  /** Целевое количество точек. */
  targetSize?: number;
  /** Доля точек, удаляемых на каждой итерации (0-1). */
  removeFrationRange?: [number, number];
  /** Интервал между итерациями в мс. */
  intervalMs?: number;
  /** Включить логирование в консоль. */
  verbose?: boolean;
  /** Создавать связь между каждой парой точек. */
  fullGraph?: boolean;
}

/**
 * Генерирует динамические данные для проверки Graph View.
 *
 * Тестер не управляет PointsScene или EdgesScene напрямую.
 * Он является источником PointModel/EdgeRef и передаёт их
 * в PointGraphManager, который отвечает за состояние графа
 * и уведомляет сцены об изменениях.
 */
export class PointsSceneTester {
  private config: Required<TestConfig>;
  private timerId: number | null = null;
  private nextId = 1000;

  private readonly pointGraphManager: PointGraphManager;

  constructor(
    private readonly mediator: AppMediator,
    config: TestConfig = {},
  ) {
    this.pointGraphManager = new PointGraphManager(this.mediator);
    this.config = {
      updateFrationRange: config.updateFrationRange ?? [0.2, 0.7],
      removeFrationRange: config.removeFrationRange ?? [0.05, 0.2],
      targetSize: config.targetSize ?? 50,
      intervalMs: config.intervalMs ?? 4000,
      verbose: config.verbose ?? true,
      fullGraph: config.fullGraph ?? true,
    };
  }

  public getPointGraphManager(): PointGraphManager {
    return this.pointGraphManager;
  }

  public start(): void {
    if (this.timerId !== null) return;

    this.log("Тест запущен");
    this.iteration();
  }

  public stop(): void {
    if (this.timerId === null) return;

    clearTimeout(this.timerId);
    this.timerId = null;
    this.log("Тест остановлен");
  }

  private iteration(): void {
    this._iteration();

    this.timerId = window.setTimeout(() => this.iteration(), this.config.intervalMs);
  }

  @Safe
  private _iteration(): void {
    const start = performance.now();
    const points = this.pointGraphManager.getPointsArray();

    const removeCount = this.randomInt(0, Math.max(0, points.length - this.config.targetSize));

    if (removeCount > 0) {
      const ids = [...points]
        .shuffle()
        .slice(0, removeCount)
        .map((point) => point.id);

      this.pointGraphManager.removePoints(ids);
    }

    const [updateMin, updateMax] = this.config.updateFrationRange;
    const updateCount = this.randomInt(Math.floor(points.length * updateMin), Math.ceil(points.length * updateMax));
    const updatedPoints = [...points].shuffle().slice(0, updateCount);

    for (const point of updatedPoints) {
      this.mutatePoint(point);
    }

    const addCount = this.randomInt(0, Math.max(0, this.config.targetSize - points.length));
    const newPoints: Point[] = [];

    for (let i = 0; i < addCount; i++) {
      newPoints.push(this.generateRandomPoint());
    }

    this.pointGraphManager.addPoints(newPoints);

    const edges = this.createEdges(points);
    this.pointGraphManager.initFromRefs(edges);

    const duration = performance.now() - start;
    const finalPoints = this.pointGraphManager.getPointsArray();

    this.log(
      `Итерация: размер=${finalPoints.length}, добавлено=${addCount}, удалено=${removeCount}, обновлено=${updateCount}, рёбер=${edges.length}, время=${duration.toFixed(2)}ms`,
    );
    this.mediator.pointsGraphUpdated();
  }

  /**
   * Создать тестовые связи между текущими точками.
   *
   * Связи передаются в PointGraphManager как EdgeRef.
   * Сам тестер не создаёт Edge и не знает, как именно
   * конкретный граф хранит или создаёт модели рёбер.
   */
  private createEdges(points: Point[]): EdgeRef[] {
    if (!this.config.fullGraph) return [];

    const edges: EdgeRef[] = [];

    for (let i = 0; i < points.length; i++) {
      for (let k = 1; k < 4; k++) {
        let j = (i + k) % points.length;
        edges.push({
          sourceId: points[i].id,
          targetId: points[j].id,
        });
      }
    }

    return edges;
  }

  private generateRandomPoint(): Point {
    const id = `p${this.nextId++}`;

    return new Point({ x: Math.random() * 800, y: Math.random() * 600, z: 0 }, id, id.slice(0, 6));
  }

  private mutatePoint(point: Point): void {
    point.x = Math.max(0, Math.min(1000, point.x + (Math.random() - 0.5) * 100));
    point.y = Math.max(0, Math.min(800, point.y + (Math.random() - 0.5) * 100));

    if (Math.random() > 0.8) {
      point.text += "!";
    }
  }

  private randomInt(min: number, max: number): number {
    if (max <= min) return min;
    return Math.floor(Math.random() * (max - min) + min);
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[PointsSceneTester] ${message}`);
    }
  }
}
