// DocumentPointsScene.ts
import { AppMediator } from "./AppMediator";
import { PointGraphManager } from "./collections/PointGraphManager";
import { EdgeRef } from "./models/EdgeRef";
import { LevenshteinEdgeModel } from "./models/LevenshteinEdgeModel";
import { Point } from "./models/Point";
import { Safe } from "@utils/logger";
import { BasePointMath } from "./models/BasePointMath";
import { AnimationEngine } from "./Engines/AnimationEngine";

interface DocumentPointsSceneConfig {
  /** Включить логирование в консоль. */
  verbose?: boolean;
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
 * Точки создаются в start(), а изменение графа выполняется постепенно
 * в step(), зарегистрированном в AnimationEngine.
 */
export class DocumentPointsScene {
  private config: Required<DocumentPointsSceneConfig>;
  private readonly pointGraphManager: PointGraphManager;

  private edgeRefs: EdgeRef[] = [];
  private edgeIndex = 0;
  private started = false;
  private disposeAnimationStep: (() => void) | null = null;

  constructor(
    private readonly mediator: AppMediator,
    private readonly animationEngine: AnimationEngine,
    config: DocumentPointsSceneConfig = {},
  ) {
    this.pointGraphManager = new PointGraphManager(this.mediator, {
      create: (edgeRef) => {
        const source = this.pointGraphManager.getPointById(edgeRef.sourceId);
        const target = this.pointGraphManager.getPointById(edgeRef.targetId);

        if (!source || !target) return null;

        return LevenshteinEdgeModel.fromPoints(source, target);
      },
    });

    this.config = {
      verbose: config.verbose ?? true,
    };
  }

  public getPointGraphManager(): PointGraphManager {
    return this.pointGraphManager;
  }

  /**
   * Загрузить документы и подготовить начальное состояние графа.
   *
   * Сами рёбра здесь не создаются: это позволяет не выполнять все
   * Levenshtein-расчёты одним блокирующим вызовом.
   */
  @Safe
  public async start(): Promise<void> {
    if (this.started) return;

    this.started = true;
    const start = performance.now();

    this.log("Граф документов на Левенштейне запущен");

    const resp = await fetch("http://localhost:3000/api/document/04a66bf4-1e51-4041-bca2-0bb9e798f702/md");
    const documents: { lang: string; code: string }[] = await resp.json();
    const texts = documents.map((document) => document.code);
    const points = this.createPoints(texts);

    this.edgeRefs = this.createLevenshteinEdges(points);
    this.edgeIndex = 0;

    this.pointGraphManager.updatePoints(points);
    this.mediator.pointsGraphUpdated();

    const duration = performance.now() - start;
    this.log(`Подготовлено: вершин=${points.length}, кандидатов рёбер=${this.edgeRefs.length}, время=${duration.toFixed(2)}ms`);
    this.disposeAnimationStep = this.animationEngine.addCallback(() => this.step());
  }

  /**
   * Выполнить одну модификацию графа.
   *
   * За один шаг создаётся не более одного ребра, поэтому тяжёлый
   * Levenshtein-расчёт не выполняется сразу для всех пар документов.
   */
  public step(): void {
    if (!this.started) return;
    if (this.edgeIndex >= this.edgeRefs.length) {
      this.disposeAnimationStep?.();
      this.disposeAnimationStep = null;
      return;
    }

    const edgeRef = this.edgeRefs[this.edgeIndex++];
    const edge = this.pointGraphManager.addEdge(edgeRef);

    if (!edge) return;

    this.log(`Добавлено ребро: ${edge.sourceId} <-> ${edge.targetId}, distance=${edge.distance}`);
    this.mediator.pointsGraphUpdated();
  }

  public destroy(): void {
    this.disposeAnimationStep?.();
    this.disposeAnimationStep = null;
  }

  /** Создать точки документов. */
  private createPoints(texts: string[]): DocumentPoint[] {
    return texts
      .filter((text) => text.length > 200)
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
  }

  /**
   * Создать ссылки на рёбра между всеми уникальными парами документов.
   *
   * Здесь создаются только дешёвые EdgeRef. LevenshteinEdgeModel
   * вычисляется позже, когда соответствующая ссылка обрабатывается step().
   */
  private createLevenshteinEdges(points: DocumentPoint[]): EdgeRef[] {
    const edges: EdgeRef[] = [];

    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        edges.push({
          sourceId: points[i].id,
          targetId: points[j].id,
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
