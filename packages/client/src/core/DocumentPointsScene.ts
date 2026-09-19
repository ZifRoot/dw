// DocumentPointsScene.ts
import { levenshteinEdits } from "@utils/levenshtein-edits";
import { AppMediator } from "./AppMediator";
import { PointGraphManager } from "./collections/PointGraphManager";
import { EdgeRef } from "./models/EdgeRef";
import { LevenshteinEdgeModel } from "./models/LevenshteinEdgeModel";
import { Point } from "./models/Point";
import { Safe } from "@utils/logger";
import { BasePointMath } from "./models/BasePointMath";

interface DocumentPointsSceneConfig {
  /** Интервал между повторными расчётами в мс. */
  intervalMs?: number;
  /** Включить логирование в консоль. */
  verbose?: boolean;
  maxEdgeDistance?: number;
}

let nextId = 1000;
export class DocumentPoint extends Point {
  constructor(
    point: BasePointMath,
    public largeText: string,
  ) {
    super(point, `p${nextId++}`, largeText.substring(0, 20));
  }
}

/**
 * Генерирует граф документов на основе расстояния Левенштейна.
 *
 * Для каждой пары строк вычисляется levenshteinDistance.
 * Полученное расстояние записывается непосредственно в EdgeRef.distance.
 *
 * Для N строк рассматриваются все уникальные пары:
 * N * (N - 1) / 2 вычислений расстояния.
 * Это O(N²) по количеству строк.
 */
export class DocumentPointsScene {
  private config: Required<DocumentPointsSceneConfig>;
  private timerId: number | null = null;

  private readonly pointGraphManager: PointGraphManager;

    constructor(
    private readonly mediator: AppMediator,
    config: DocumentPointsSceneConfig = {},
  ) {
    this.pointGraphManager = new PointGraphManager(this.mediator, {
      create: (edgeRef) => {
        const source = this.pointGraphManager.getPointById(edgeRef.sourceId);
        const target = this.pointGraphManager.getPointById(edgeRef.targetId);

        if (!source || !target) return null;

        return LevenshteinEdgeModel.fromRef(source, target, edgeRef);
      },
    });
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

    this.log("Граф документов на Левенштейне запущен");
    this.iteration();
  }

  public stop(): void {
    if (this.timerId === null) return;

    clearTimeout(this.timerId);
    this.timerId = null;
    this.log("Граф документов на Левенштейне остановлен");
  }

  private iteration(): void {
    this._iteration();

    if (false) this.timerId = window.setTimeout(() => this.iteration(), this.config.intervalMs);
  }

  @Safe
  private async _iteration() {
    const start = performance.now();

    const resp = await fetch("http://localhost:3000/api/document/04a66bf4-1e51-4041-bca2-0bb9e798f702/md");
    const documents: { lang: string; code: string }[] = await resp.json();
    const texts = documents.map((document) => document.code);
    const textLengths = texts.map((text) => text.length).sort((a, b) => b - a);
    const points = this.createPoints(texts);
    const edges = this.createLevenshteinEdges(points);

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
   * Создать точки документов.
   */
  private createPoints(texts: string[]): DocumentPoint[] {
    const newPoints = texts
      .filter((s) => s.length > 200)
      .map((text, index) => {
        return new DocumentPoint(
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
  private createLevenshteinEdges(points: DocumentPoint[]): EdgeRef[] {
    const edges: EdgeRef[] = [];

    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const source = points[i];
        const target = points[j];
        const edits = levenshteinEdits(source.largeText, target.largeText);

        edges.push({
          sourceId: source.id,
          targetId: target.id,
          distance: 100,
          levenshteinDistance: edits.length,
          levenshteinEdits: edits,
        });
      }
    }

    return edges;
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[DocumentPointsScene] ${message}`);
    }
  }
}
