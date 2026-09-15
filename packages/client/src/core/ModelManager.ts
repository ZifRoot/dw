// core/ModelManager.ts
import { AppMediator, PointsModelReadyPayload } from "./AppMediator";
import { PointModel } from "./models/PointModel";
import { EdgeModel } from "./models/EdgeModel";
import { PointGraphManager } from "./PointGraphManager";
import { Log } from "@utils/logger";

/**
 * ModelManager – строит и улучшает граф ближайших соседей.
 * Считает среднее косинусное расстояние по ВСЕМ общим моделям эмбеддингов.
 * Не использует кэши векторов, работая напрямую с PointModel.embeddings.
 */
export class ModelManager {
  private pointGraphManager: PointGraphManager;
  private edges: EdgeModel[] = [];
  private readonly edgeWeight = 100;

  private unsubPoints: () => void;
  private unsubStep: () => void;

  constructor(
    private mediator: AppMediator,
    private K: number = 3,
    private maxCandidates: number = 50,
  ) {
    this.pointGraphManager = new PointGraphManager();

    this.unsubPoints = this.mediator.onPointsModelReady((payload) => {
      this.updatePoints(payload);
    });

    this.unsubStep = this.mediator.onModelManagerStep(() => {
      this.step();
    });
  }

  public destroy(): void {
    this.unsubPoints();
    this.unsubStep();
  }

  private updatePoints(payload: PointsModelReadyPayload): void {
    const { points, edges } = payload;
    this.pointGraphManager.updatePoints(points);
    if (this.pointGraphManager.getPoints().length === 0) return;

    if (edges.length > 0) {
      // Восстанавливаем сохранённые связи вместо случайной инициализации
      this.pointGraphManager.initFromRefs(edges);
    } else {
      this.pointGraphManager.initRandom(this.K);
    }
    this.rebuildEdges();
  }

  private step(): void {
    if (this.pointGraphManager.getPoints().length === 0) return;
    this.improve();
    this.rebuildEdges();
  }

  /**
   * Вычисляет СРЕДНЕЕ косинусное расстояние по всем общим моделям двух точек.
   * Возвращает null, если общих моделей нет (точки в разных пространствах).
   */
  private calculateAverageCosineDistance(p1: PointModel, p2: PointModel): number | null {
    let totalDistance = 0;
    let commonCount = 0;

    for (const [modelName, emb1] of p1.embeddings.entries()) {
      const emb2 = p2.embeddings.get(modelName);
      if (emb2) {
        totalDistance += this.cosineDistance(emb1.value, emb2.value);
        commonCount++;
      }
    }

    return commonCount > 0 ? totalDistance / commonCount : null;
  }

  @Log
  private improve(): void {
    const points = this.pointGraphManager.getPoints();
    const pointCollection = this.pointGraphManager.getPointCollection();

    for (const source of points) {
      const currentEdges = this.pointGraphManager.getEdgesForPoint(source.id);

      type ScoredCandidate = {
        targetId: string;
        distance: number;
        model?: EdgeModel;
        isNew: boolean;
      };

      const scored: ScoredCandidate[] = [];
      const existingTargets = new Set<string>();

      // 1. Оцениваем текущих соседей
      for (const edge of currentEdges) {
        const otherId = edge.sourceId === source.id ? edge.targetId : edge.sourceId;
        existingTargets.add(otherId);

        const otherPoint = pointCollection.getById(otherId);
        if (otherPoint) {
          const distance = this.calculateAverageCosineDistance(source, otherPoint);
          if (distance !== null) {
            scored.push({ targetId: otherId, distance, model: edge, isNew: false });
          }
        }
      }

      // 2. Оцениваем новых кандидатов
      const newCandidates: ScoredCandidate[] = [];
      for (const target of points) {
        if (target.id === source.id || existingTargets.has(target.id)) continue;

        const distance = this.calculateAverageCosineDistance(source, target);
        if (distance !== null) {
          newCandidates.push({ targetId: target.id, distance, isNew: true });
        }
      }

      // Берём только maxCandidates лучших новых (с наименьшим расстоянием)
      newCandidates.sort((a, b) => a.distance - b.distance);
      for (const c of newCandidates.slice(0, this.maxCandidates)) {
        scored.push(c);
      }

      // 3. Сортируем всех (старые + новые) по возрастанию расстояния
      scored.sort((a, b) => a.distance - b.distance);

      // 4. Оставляем строго топ-K
      const topK = scored.slice(0, this.K);
      const topKTargets = new Set(topK.map((c) => c.targetId));

      // 5. Синхронизируем граф: удаляем "плохие", добавляем новые
      for (const candidate of scored) {
        if (!candidate.isNew && !topKTargets.has(candidate.targetId) && candidate.model) {
          this.pointGraphManager.removeEdge(candidate.model);
        }
      }

      for (const candidate of topK) {
        if (candidate.isNew) {
          this.pointGraphManager.addEdge({
            sourceId: source.id,
            targetId: candidate.targetId,
            modelName: "", // PointGraphManager сам выберет лучшую модель
          });
        }
      }
    }
  }

  private cosineDistance(v1: number[], v2: number[]): number {
    if (!v1 || !v2 || v1.length === 0 || v2.length === 0 || v1.length !== v2.length) return 1;
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

  private rebuildEdges(): void {
    const edgeRefs = this.pointGraphManager.getAllEdgeRefs();

    this.edges = this.pointGraphManager.edgeIndexesToEdgeModels(edgeRefs, {
      distance: this.edgeWeight,
    });

    this.mediator.edges = this.edges;
  }

  public getPairs(): { source: PointModel; target: PointModel }[] {
    return this.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
    }));
  }
}
