// PointsSceneTester.ts
import { levenshteinDistance } from "@utils/levenshtein-distance";
import { AppMediator } from "./AppMediator";
import { PointGraphManager } from "./collections/PointGraphManager";
import { EdgeRef } from "./models/EdgeRef";
import { Point } from "./models/Point";
import { Safe } from "@utils/logger";
import { BasePointMath } from "./models/BasePointMath";

interface TestConfig {
  /** Интервал между повторными расчётами в мс. */
  intervalMs?: number;
  /** Включить логирование в консоль. */
  verbose?: boolean;
  maxEdgeDistance?: number;
}

let nextId = 1000;
export class PointX extends Point {
  constructor(
    point: BasePointMath,
    public textLag: string,
  ) {
    super(point, `p${nextId++}`, textLag.substring(0, 20));
  }
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

  private readonly pointGraphManager: PointGraphManager;

  private readonly testStrings: string[] = ["кот", "котик", "кошка", "собака", "собаки", "дом", "домик", "машина", "машинка", "самолёт"];

  constructor(
    private readonly mediator: AppMediator,
    config: TestConfig = {},
  ) {
    this.pointGraphManager = new PointGraphManager(this.mediator);
    this.config = {
      intervalMs: config.intervalMs ?? 4000,
      verbose: config.verbose ?? true,
      maxEdgeDistance: config.maxEdgeDistance ?? 300,
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

    if (false) this.timerId = window.setTimeout(() => this.iteration(), this.config.intervalMs);
  }

  @Safe
  private async _iteration() {
    const start = performance.now();

    const resp = await fetch("http://localhost:3000/api/document/04a66bf4-1e51-4041-bca2-0bb9e798f702/md");
    const mm: { lang: string; code: string }[] = await resp.json();
    let codes = mm.map((m) => m.code);
    let les = codes.map((c) => c.length).sort((a, b) => b - a);
    const points = this.getOrCreatePoints(codes);
    const edges = this.createEdges(points);

    this.pointGraphManager.update(points, edges);
    this.pointGraphManager.removeEdges(
      this.pointGraphManager.getPointIds().flatMap((id) =>
        this.pointGraphManager
          .getEdgesForPoint(id)
          .sort((a, b) => b.distance - a.distance)
          .slice(0, 10),
      ),
    );

    const duration = performance.now() - start;

    this.log(`Граф: вершин=${points.length}, рёбер=${edges.length}, расстояний=${edges.length}, время=${duration.toFixed(2)}ms`);

    for (const edge of edges) {
      this.log(`  ${edge.sourceId} <-> ${edge.targetId}: distance=${edge.distance}`);
    }

    this.mediator.pointsGraphUpdated();
  }

  /**
   * Создать тестовые точки из фиксированного массива строк.
   */
  private getOrCreatePoints(testStrings: string[]): PointX[] {
    const newPoints = testStrings
      .filter((s) => s.length > 200)
      .map((text, index) => {
        return new PointX(
          {
            x: 80 + (index % 5) * 180,
            y: 100 + Math.floor(index / 5) * 250,
            z: 0,
          },
          text,
        );
      });

    return newPoints;
  }

  /**
   * Создать граф по расстоянию Левенштейна.
   *
   * Расстояние вычисляется для каждой уникальной пары точек.
   * Ребро не дублируется в обратном направлении, поскольку Edge
   * представляет неориентированную связь.
   */
  private createEdges(points: PointX[]): EdgeRef[] {
    const edges: EdgeRef[] = [];

    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const source = points[i];
        const target = points[j];
        const distance = levenshteinDistance(source.textLag, target.textLag) * 2 + 90;

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
