// core/ModelManager.ts
import { AppMediator } from "./AppMediator";
import { PointModel } from "./models/PointModel";
import { EmbeddingModel } from "./models/EmbeddingModel";
import { EdgeModel } from "./models/EdgeModel";
import { EntityCollection } from "./Scene/indexer";
import { ActiveDimensionsBuilder } from "./ActiveDimensionsBuilder";
import { PatternMatcher } from "./PatternMatcher";
import { NeighborGraph } from "./NeighborGraph";
import { edgeIndexesToEdgeModels } from "./edge-utils";

/**
 * ModelManager – строит и улучшает граф ближайших соседей на основе эмбеддингов.
 * Использует двухэтапный подход: бинарный отсев (активные размерности) + косинусное расстояние.
 * Отправляет рёбра в медиатор для отображения в EdgesScene.
 */
export class ModelManager {
  // Коллекция точек (источник истины)
  private pointCollection: EntityCollection<PointModel> = new EntityCollection((p) => p.id);

  // Кэши бинарных и векторных представлений для быстрого доступа
  private binaryCache: Map<string, EmbeddingModel> = new Map();
  private vectorCache: Map<string, number[]> = new Map();

  // Граф соседей
  private graph: NeighborGraph;

  // Сервисы
  private builder: ActiveDimensionsBuilder;

  // Текущие рёбра (модели)
  private edges: EdgeModel[] = [];
  private readonly edgeWeight = 100;

  // Отписки
  private unsubPoints: () => void;
  private unsubStep: () => void;

  constructor(
    private mediator: AppMediator,
    activationThreshold: number = 0.5,
    private K: number = 3,
    private maxCandidates: number = 20,
  ) {
    this.builder = new ActiveDimensionsBuilder(activationThreshold);
    this.matcher = new PatternMatcher();
    this.graph = new NeighborGraph(this.K, this.maxCandidates, this.matcher);

    // Подписка на получение модельных точек
    this.unsubPoints = this.mediator.onPointsModelReady((points) => {
      this.updatePoints(points);
    });

    // Подписка на команду шага улучшения (вызывается из UI или таймера)
    this.unsubStep = this.mediator.onModelManagerStep(() => {
      this.step();
    });
  }

  public destroy(): void {
    this.unsubPoints();
    this.unsubStep();
  }

  // ========== Приватные методы ==========

  /**
   * Обновить точки, перестроить кэши и инициализировать граф.
   */
  private updatePoints(points: PointModel[]): void {
    this.pointCollection.clear();
    this.pointCollection._setPoints(points, [], []);

    this.buildBinaryCache();
    this.buildVectorCache();

    const ids = Array.from(this.binaryCache.keys());
    if (ids.length > 0) {
      this.graph.initRandom(ids);
      this.rebuildEdges();
    }
  }

  /**
   * Построить бинарные эмбеддинги (активные размерности) для каждой точки.
   * Используется первая доступная модель.
   */
  private buildBinaryCache(): void {
    this.binaryCache.clear();
    const threshold = this.builder.computeThreshold(this.pointCollection.items);

    for (const point of this.pointCollection.items) {
      const firstModel = point.embeddings.keys().next().value;
      if (!firstModel) continue;

      const binary = this.builder.buildForPoint(point, firstModel, threshold);
      if (binary) {
        this.binaryCache.set(point.id, binary);
      }
    }
  }

  /**
   * Построить кэш полных векторов для косинусного расстояния.
   * Используется первая доступная модель.
   */
  private buildVectorCache(): void {
    this.vectorCache.clear();
    for (const point of this.pointCollection.items) {
      const firstModel = point.embeddings.keys().next().value;
      if (!firstModel) continue;
      const emb = point.embeddings.get(firstModel);
      if (emb) {
        this.vectorCache.set(point.id, emb.value);
      }
    }
  }

  /**
   * Один шаг улучшения соседей.
   */
  private step(): void {
    const ids = Array.from(this.binaryCache.keys());
    if (ids.length === 0) return;

    this.graph.improve(ids, this.binaryCache, this.vectorCache, this.cosineDistance);
    this.rebuildEdges();
  }

  /**
   * Перестроить рёбра из текущего графа и отправить в медиатор.
   */
  private rebuildEdges(): void {
    const edgeIndexes = this.graph.getAllEdgeIndexes();

    // Преобразуем EdgeRef → EdgeModel с константным весом
    this.edges = edgeIndexesToEdgeModels(edgeIndexes, this.pointCollection, this.matcher, { distance: this.edgeWeight });

    // Отправляем упрощённое представление для EdgesScene
    const edgeData = this.edges.map((e) => ({
      sourceId: e.source.id,
      targetId: e.target.id,
      distance: e.distance,
      color: e.color,
    }));
    this.mediator.edges = edgeData;
  }

  /**
   * Косинусное расстояние между двумя векторами.
   */
  private cosineDistance(v1: number[], v2: number[]): number {
    if (!v1 || !v2 || v1.length === 0 || v2.length === 0) return 1;
    let dot = 0,
      norm1 = 0,
      norm2 = 0;
    for (let i = 0; i < v1.length; i++) {
      dot += v1[i] * v2[i];
      norm1 += v1[i] * v1[i];
      norm2 += v2[i] * v2[i];
    }
    if (norm1 === 0 || norm2 === 0) return 1;
    return 1 - dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  // ========== Публичные методы для внешнего использования ==========

  /**
   * Возвращает пары точек (source, target) для использования в физике (EmbeddingEngine / GraphEngine).
   */
  public getPairs(): { source: PointModel; target: PointModel }[] {
    return this.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
    }));
  }
}
