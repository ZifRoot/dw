// core/ModelManager.ts
import { AppMediator } from "./AppMediator";
import { PointModel } from "./models/PointModel";
import { EmbeddingModel } from "./models/EmbeddingModel";
import { EdgeModel } from "./models/EdgeModel";
import { ActiveDimensionsBuilder } from "./ActiveDimensionsBuilder";
import { PointGraphManager } from "./PointGraphManager";
import { edgeIndexesToEdgeModels } from "./edge-utils";
import { EdgeRef } from "./models/EdgeRef";

/**
 * ModelManager – строит и улучшает граф ближайших соседей на основе эмбеддингов.
 * Использует двухэтапный подход: бинарный отсев + косинусное расстояние.
 * Не управляет точками напрямую, делегируя это PointGraphManager.
 */
export class ModelManager {
  private binaryCache: Map<string, EmbeddingModel> = new Map();
  private vectorCache: Map<string, number[]> = new Map();
  private pointModelMap: Map<string, string> = new Map();

  private pointGraphManager: PointGraphManager;
  private builder: ActiveDimensionsBuilder;

  private edges: EdgeModel[] = [];
  private readonly edgeWeight = 100;

  private unsubPoints: () => void;
  private unsubStep: () => void;

  constructor(
    private mediator: AppMediator,
    activationThreshold: number = 0.5,
    private K: number = 3,
    private maxCandidates: number = 20,
  ) {
    this.builder = new ActiveDimensionsBuilder(activationThreshold);
    this.pointGraphManager = new PointGraphManager();

    this.unsubPoints = this.mediator.onPointsModelReady((points) => {
      this.updatePoints(points);
    });

    this.unsubStep = this.mediator.onModelManagerStep(() => {
      this.step();
    });
  }

  public destroy(): void {
    this.unsubPoints();
    this.unsubStep();
  }

  private updatePoints(points: PointModel[]): void {
    this.pointGraphManager.updatePoints(points);
    this.buildBinaryCache();
    this.buildVectorCache();

    const ids = this.pointGraphManager.getPointIds();
    if (ids.length > 0) {
      this.pointGraphManager.initRandom(ids, this.K);
      this.rebuildEdges();
    }
  }

  private buildBinaryCache(): void {
    this.binaryCache.clear();
    this.pointModelMap.clear();

    const points = this.pointGraphManager.getPoints();
    const threshold = this.builder.computeThreshold(points);

    for (const point of points) {
      const firstModel = point.embeddings.keys().next().value;
      if (!firstModel) continue;

      this.pointModelMap.set(point.id, firstModel);

      const binary = this.builder.buildForPoint(point, firstModel, threshold);
      if (binary) {
        this.binaryCache.set(point.id, binary);
      }
    }
  }

  private buildVectorCache(): void {
    this.vectorCache.clear();
    const points = this.pointGraphManager.getPoints();

    for (const point of points) {
      const modelName = this.pointModelMap.get(point.id);
      if (!modelName) continue;

      const emb = point.embeddings.get(modelName);
      if (emb) {
        this.vectorCache.set(point.id, emb.value);
      }
    }
  }

  private step(): void {
    const ids = this.pointGraphManager.getPointIds();
    if (ids.length === 0) return;

    this.improve(ids);
    this.rebuildEdges();
  }

  /**
   * Один шаг улучшения: для каждой точки объединяем текущих соседей и новых кандидатов,
   * сортируем по расстоянию и оставляем только топ-K. "Плохие" связи удаляются.
   */
  private improve(ids: string[]): void {
    console.log("improve");
    for (const sourceId of ids) {
      const sourceModel = this.pointModelMap.get(sourceId);
      const sourceBinary = this.binaryCache.get(sourceId);
      const sourceVector = this.vectorCache.get(sourceId);
      if (!sourceModel || !sourceBinary || !sourceVector) continue;

      // 1. Собираем текущие рёбра этой точки с нужной моделью + их расстояния
      const currentEdges = this.pointGraphManager.getEdgesForPoint(sourceId).filter((e) => e.modelName === sourceModel);

      type ScoredEdge = {
        ref: EdgeRef;
        distance: number;
        model?: EdgeModel;
        isNew: boolean;
      };

      const scored: ScoredEdge[] = [];
      const existingTargets = new Set<string>();

      for (const edge of currentEdges) {
        const otherId = edge.sourceId === sourceId ? edge.targetId : edge.sourceId;
        const otherVector = this.vectorCache.get(otherId);
        if (!otherVector) continue;

        const distance = this.cosineDistance(sourceVector, otherVector);
        scored.push({
          ref: { sourceId, targetId: otherId, modelName: sourceModel },
          distance,
          model: edge,
          isNew: false,
        });
        existingTargets.add(otherId);
      }

      // 2. Собираем новых кандидатов (исключая уже существующих соседей)
      const newCandidates: { id: string; distance: number }[] = [];

      for (const targetId of ids) {
        if (targetId === sourceId) continue;
        if (existingTargets.has(targetId)) continue;

        const targetModel = this.pointModelMap.get(targetId);
        if (targetModel !== sourceModel) continue;

        const targetBinary = this.binaryCache.get(targetId);
        const targetVector = this.vectorCache.get(targetId);
        if (!targetBinary || !targetVector) continue;

        if (this.countIntersection(sourceBinary, targetBinary) === 0) continue;

        const distance = this.cosineDistance(sourceVector, targetVector);
        newCandidates.push({ id: targetId, distance });
      }

      // Берём только maxCandidates лучших новых кандидатов
      newCandidates.sort((a, b) => a.distance - b.distance);
      for (const c of newCandidates.slice(0, this.maxCandidates)) {
        scored.push({
          ref: { sourceId, targetId: c.id, modelName: sourceModel },
          distance: c.distance,
          isNew: true,
        });
      }

      // 3. Сортируем всех (старые + новые) по расстоянию и оставляем топ-K
      scored.sort((a, b) => a.distance - b.distance);
      const topK = scored.slice(0, this.K);
      const topKTargets = new Set(topK.map((c) => c.ref.targetId));

      // 4. Синхронизируем: удаляем "плохие" существующие, добавляем новые из топ-K
      for (const existing of scored) {
        if (existing.isNew) continue;
        if (!topKTargets.has(existing.ref.targetId) && existing.model) {
          this.pointGraphManager.removeEdge(existing.model);
        }
      }

      for (const candidate of topK) {
        if (candidate.isNew) {
          this.pointGraphManager.addEdge(candidate.ref);
        }
      }
    }
  }

  private countIntersection(binary1: EmbeddingModel, binary2: EmbeddingModel): number {
    const set1 = new Set(binary1.value);
    let count = 0;
    for (const dim of binary2.value) {
      if (set1.has(dim)) count++;
    }
    return count;
  }

  private rebuildEdges(): void {
    const edgeRefs = this.pointGraphManager.getAllEdgeRefs();
    const pointCollection = this.pointGraphManager.getPointCollection();

    this.edges = edgeIndexesToEdgeModels(edgeRefs, pointCollection, {
      distance: this.edgeWeight,
    });

    const edgeData = this.edges.map((e) => ({
      sourceId: e.source.id,
      targetId: e.target.id,
      distance: e.distance,
      color: e.color,
    }));

    this.mediator.edges = edgeData;
  }

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

  public getPairs(): { source: PointModel; target: PointModel }[] {
    return this.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
    }));
  }
}
