// PointsSceneTester.ts
import { AppMediator } from "./AppMediator";
import { PointGraphManager } from "./collections/PointGraphManager";
import { EdgeRef } from "./models/EdgeRef";
import { Point } from "./models/Point";
import { Safe } from "@utils/logger";
import { levenshteinDistance } from "../../../shared/src/utils/levenshtein-distance";

interface TestConfig {
  /** Интервал между повторными расчётами в мс. */
  intervalMs?: number;
  /** Включить логирование в консоль. */
  verbose?: boolean;
}

/**
 * Генерирует тестовый граф строк на основе расстояния Левенштейна.
 *
 * Для каждой пары строк вычисляется levenshteinDistance.
 * Полученное расстояние записывается непосредственно в EdgeRef.distance.
 *
 * Для N строк рассматриваются все уникальные пары:
 * N * (N - 1) / 2 вычислений расстояния.
 * Это O(N²) по количеству строк.
 */
export class PointsSceneTester {
  private config: Required<TestConfig>;
  private timerId: number | null = null;
  private nextId = 1000;

  private readonly pointGraphManager: PointGraphManager;

  private readonly testStrings: string[] = [
    "кот",
    "котик",
    "кошка",
    "собака",
    "собаки",
    "дом",
    "домик",
    "машина",
    "машинка",
    "самолёт",
  ];

  constructor(
    private readonly mediator: AppMediator,
    config: TestConfig = {},
  ) {
    this.pointGraphManager = new PointGraphManager(this.mediator);
    this.config = {
      intervalMs: config.intervalMs ?? 4000,
      verbose: config.verbose ?? true,
    };
  }

  public getPointGraphManager(): PointGraphManager {
    return this.pointGraphManager;
  }

  public start(): void {
    if (this.timerId !== null) return;

    this.log("Тест Левенштейна запущен");
    this.iteration();
  }

  public stop(): void {
    if (this.timerId === null) return;

    clearTimeout(this.timerId);
    this.timerId = null;
    this.log("Тест Левенштейна остановлен");
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

    const points = this.getOrCreatePoints();
    const edges = this.createEdges(points);

    this.pointGraphManager.update(points, edges);

    const duration = performance.now() - start;

    this.log(
      `Граф: вершин=${points.length}, рёбер=${edges.length}, расстояний=${edges.length}, время=${duration.toFixed(2)}ms`,
    );

    for (const edge of edges) {
      this.log(
        `  ${edge.sourceId} <-> ${edge.targetId}: distance=${edge.distance}`,
      );
    }

    this.mediator.pointsGraphUpdated();
  }

  /**
   * Создать тестовые точки из фиксированного массива строк.
   */
  private getOrCreatePoints(): Point[] {
    const points = this.pointGraphManager.getPointsArray();

    if (points.length === this.testStrings.length) {
      return points;
    }

    const newPoints = this.testStrings.map((text, index) => {
      const id = `p${this.nextId++}`;

      return new Point(
        {
          x: 80 + (index % 5) * 180,
          y: 100 + Math.floor(index / 5) * 250,
          z: 0,
        },
        id,
        text,
      );
    });

    this.pointGraphManager.updatePoints(newPoints);

    return this.pointGraphManager.getPointsArray();
  }

  /**
   * Создать граф по расстоянию Левенштейна.
   *
   * Расстояние вычисляется для каждой уникальной пары точек.
   * Ребро не дублируется в обратном направлении, поскольку Edge
   * представляет неориентированную связь.
   */
  private createEdges(points: Point[]): EdgeRef[] {
    const edges: EdgeRef[] = [];

    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const source = points[i];
        const target = points[j];
        const distance = levenshteinDistance(source.text, target.text);

        edges.push({
          sourceId: source.id,
          targetId: target.id,
          distance,
        });
      }
    }

    return edges;
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[PointsSceneTester] ${message}`);
    }
  }
}
