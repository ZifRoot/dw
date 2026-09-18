// PointsSceneTester.ts
import { PointGraphManager } from "./collections/PointGraphManager";
import { EdgeRef } from "./models/EdgeRef";
import { PointModel } from "./models/PointModel";
import { Point } from "./models/Point";
import { Safe } from "@utils/logger";

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
  /** Имя модели для тестовых рёбер. */
  edgeModelName?: string;
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

  constructor(
    private readonly pointGraphManager: PointGraphManager,
    config: TestConfig = {},
  ) {
    this.config = {
      updateFrationRange: config.updateFrationRange ?? [0.2, 0.7],
      removeFrationRange: config.removeFrationRange ?? [0.05, 0.2],
      targetSize: config.targetSize ?? 5,
      intervalMs: config.intervalMs ?? 1000,
      verbose: config.verbose ?? true,
      fullGraph: config.fullGraph ?? true,
      edgeModelName: config.edgeModelName ?? "test",
    };
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

    this.timerId = window.setTimeout(
      () => this.iteration(),
      this.config.intervalMs,
    );
  }

  @Safe
  private _iteration(): void {
    const start = performance.now();
    let points = this.pointGraphManager.getPointsArray();

    const removeCount = this.randomInt(
      0,
      Math.max(0, points.length - this.config.targetSize),
    );

    if (removeCount > 0) {
      const ids = [...points]
        .shuffle()
        .slice(0, removeCount)
        .map((point) => point.id);

      const removed = new Set(ids);
      points = points.filter((point) => !removed.has(point.id));
    }

    const [updateMin, updateMax] = this.config.updateFrationRange;
    const updateCount = this.randomInt(
      Math.floor(points.length * updateMin),
      Math.ceil(points.length * updateMax),
    );
    const updatedPoints = [...points]
      .shuffle()
      .slice(0, updateCount);

    for (const point of updatedPoints) {
      this.mutatePoint(point);
    }

    const addCount = this.randomInt(
      0,
      Math.max(0, this.config.targetSize - points.length),
    );

    for (let i = 0; i < addCount; i++) {
      points.push(this.generateRandomPoint());
    }

    const edges = this.createEdges(points);
    this.pointGraphManager.update(points, edges);

    const duration = performance.now() - start;
    const finalPoints = this.pointGraphManager.getPointsArray();


    this.log(
      `Итерация: размер=${finalPoints.length}, добавлено=${addCount}, удалено=${removeCount}, обновлено=${updateCount}, рёбер=${edges.length}, время=${duration.toFixed(2)}ms`,
    );
  }

  /**
   * Создать тестовые связи между текущими точками.
   *
   * Связи передаются в PointGraphManager как EdgeRef.
   * Сам тестер не создаёт EdgeModel и не знает, как именно
   * конкретный граф хранит или создаёт модели рёбер.
   */
  private createEdges(points: PointModel[]): EdgeRef[] {
    if (!this.config.fullGraph) return [];

    const edges: EdgeRef[] = [];

    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        edges.push({
          sourceId: points[i].id,
          targetId: points[j].id,
          modelName: this.config.edgeModelName,
        });
      }
    }

    return edges;
  }

  private generateRandomPoint(): PointModel {
    const id = `p${this.nextId++}`;

    return new PointModel(
      new Point(
        Math.random() * 800,
        Math.random() * 600,
        0,
      ),
      id,
      id.slice(1, 3),
    );
  }

  private mutatePoint(point: PointModel): void {
    point.x = Math.max(
      0,
      Math.min(1000, point.x + (Math.random() - 0.5) * 100),
    );
    point.y = Math.max(
      0,
      Math.min(800, point.y + (Math.random() - 0.5) * 100),
    );

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
