// DocumentPointsScene.ts
import { AppMediator } from "@core/AppMediator";
import { PointGraphManager } from "@core/collections/PointGraphManager";
import { EdgeRef } from "@core/models/EdgeRef";
import { LevenshteinEdgeModel } from "@domain/Levenshtein/LevenshteinEdgeModel";
import { DocumentPoint } from "@domain/Levenshtein/DocumentPoint";
import { Safe } from "@utils/logger";
import { AnimationEngine } from "@core/Engines/AnimationEngine";

interface DocumentPointsSceneConfig {
  /** Включить логирование в консоль. */
  verbose?: boolean;
}

/**
 * Генерирует граф документов на основе расстояния Левенштейна.
 *
 * Точки создаются в start(), а изменение графа выполняется постепенно
 * в step(), зарегистрированном в AnimationEngine.
 */
export class LevenshteinManager {
  private config: Required<DocumentPointsSceneConfig>;
  private readonly pointGraphManager: PointGraphManager;
  private readonly unsubPointSelected: () => void;

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

    this.config = { verbose: config.verbose ?? true };
    this.unsubPointSelected = this.mediator.onPointSelected((point) => {
      if (point === null) this.mediator.selectPoint(null);
      else if (point instanceof DocumentPoint) this.mediator.selectPoint(this.toUiPoint(point));
    });
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
    this.unsubPointSelected();
  }

  private toUiPoint(point: DocumentPoint) {
    const neighbors = this.pointGraphManager.getEdgesForPoint(point.id).map((edge) => {
      const id = edge.sourceId === point.id ? edge.targetId : edge.sourceId;
      const neighbor = this.pointGraphManager.getPointById(id);
      return neighbor ? { id: neighbor.id, name: neighbor.text, distance: edge.distance } : null;
    }).filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a,b) => a.distance - b.distance);
    return { kind: "document" as const, id: point.id, x: point.x, y: point.y, z: point.z,
      text: point.text, pinned: point.pinned, selected: point.selected, neighbors, largeText: point.largeText };
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
      console.log(`[LevenshteinManager] ${message}`);
    }
  }
}
