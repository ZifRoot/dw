// core/ModelManager.ts
import { AppMediator } from "./AppMediator";
import { AnimationCallback, AnimationEngine } from "./Engines/AnimationEngine";
import { PointModel } from "./models/PointModel";
import { EdgeModel } from "./models/EdgeModel";
import { EdgeRef } from "./models/EdgeRef";
import { PointGraphManager } from "./PointGraphManager";
import { IEdgeModelFactory } from "./IEdgeModelFactory";

interface ScoredCandidate {
  targetId: string;
  distance: number;
  model?: EdgeModel;
  isNew: boolean;
}

/**
 * ModelManager – строит и постепенно улучшает граф ближайших соседей.
 *
 * ModelManager владеет контекстом создания EdgeModel: фабрика создаётся здесь
 * и передаётся в PointGraphManager. Сам PointGraphManager не знает, как
 * преобразовать EdgeRef в EdgeModel.
 *
 * Поиск кандидатов использует текущих соседей точки, соседей этих соседей
 * и небольшую случайную выборку. Поэтому вместо полного перебора всех точек
 * алгоритм работает с локальной окрестностью графа и постепенно улучшает её.
 *
 * Улучшение выполняется инкрементально: за один callback обрабатывается только
 * столько точек, сколько помещается в заданный бюджет времени. Планирование
 * callback и requestAnimationFrame полностью принадлежат AnimationEngine.
 */
export class ModelManager {
  private readonly K: number;
  private readonly randomCandidates: number;
  private readonly frameBudgetMs: number;
  private readonly pointGraphManager: PointGraphManager;

  private pointIndex = 0;
  private iterationChanged = false;
  private isRunningFrame = false;
  private optimizationCallback: AnimationCallback | null = null;

  private readonly unsubGraphUpdated: () => void;
  private readonly unsubStep: () => void;

  constructor(
    private mediator: AppMediator,
    private animation: AnimationEngine,
    K: number = 3,
    randomCandidates: number = 3,
    frameBudgetMs: number = 6,
  ) {
    this.K = Math.max(1, K);
    this.randomCandidates = Math.max(0, randomCandidates);
    this.frameBudgetMs = Math.max(1, frameBudgetMs);

    const edgeModelFactory: IEdgeModelFactory = {
      create: (edgeRef) => this.edgeRefToEdgeModel(edgeRef),
    };

    this.pointGraphManager = new PointGraphManager(this.mediator, edgeModelFactory);

    this.unsubGraphUpdated = this.mediator.onPointsGraphUpdated(() => {
      if (this.isRunningFrame) return;
      this.pointIndex = 0;
      this.iterationChanged = false;
      this.startOptimization();
    });

    this.unsubStep = this.mediator.onModelManagerStep(() => {
      this.startOptimization();
    });
  }

  public getPointGraphManager(): PointGraphManager {
    return this.pointGraphManager;
  }

  public destroy(): void {
    this.stopOptimization();
    this.unsubGraphUpdated();
    this.unsubStep();
  }

  /**
   * Запустить непрерывное улучшение графа через AnimationEngine.
   */
  private startOptimization(): void {
    if (this.optimizationCallback !== null) return;
    if (this.pointGraphManager.getPoints().length < 2) return;

    this.optimizationCallback = this.animation.addCallback(() => this.runStep());
  }

  /**
   * Остановить улучшение графа.
   * requestAnimationFrame здесь не используется: им управляет AnimationEngine.
   */
  private stopOptimization(): void {
    if (this.optimizationCallback !== null) {
      this.optimizationCallback();
      this.optimizationCallback = null;
    }
  }

  /**
   * Выполнить один временной квант оптимизации.
   *
   * Важно: AnimationEngine вызывает этот метод в своём animation frame,
   * а внутри одного кадра объём работы ограничивается performance.now().
   */
  private runStep(): void {
    const points = this.pointGraphManager.getPoints();
    if (points.length < 2) {
      this.stopOptimization();
      return;
    }

    const frameStart = performance.now();
    let graphChanged = false;
    this.isRunningFrame = true;

    try {
      while (this.pointIndex < points.length && performance.now() - frameStart < this.frameBudgetMs) {
        graphChanged = this.improvePoint(points[this.pointIndex]) || graphChanged;
        this.pointIndex++;
      }

      if (graphChanged) {
        this.mediator.pointsGraphUpdated();
      }
    } finally {
      this.isRunningFrame = false;
    }

    if (this.pointIndex >= points.length) {
      this.pointIndex = 0;

      const iterationChanged = this.iterationChanged || graphChanged;
      this.iterationChanged = false;

      // Если полный проход не изменил ни одного ребра, локальная оптимизация
      // сошлась и callback можно удалить из AnimationEngine.
      if (!iterationChanged) {
        this.stopOptimization();
        return;
      }
    } else if (graphChanged) {
      this.iterationChanged = true;
    }
  }

  /**
   * Создать EdgeModel из EdgeRef в контексте ModelManager.
   */
  private edgeRefToEdgeModel(edgeRef: EdgeRef): EdgeModel | null {
    const pointCollection = this.pointGraphManager.getPointCollection();
    const sourceIndex = pointCollection.indexMap.get(edgeRef.sourceId);
    const targetIndex = pointCollection.indexMap.get(edgeRef.targetId);

    if (sourceIndex == null || targetIndex == null) {
      console.warn(`edgeRefToEdgeModel: point not found: ${edgeRef.sourceId} or ${edgeRef.targetId}`);
      return null;
    }

    // Нормализуем порядок source/target по индексу для консистентности id ребра.
    let sourceId = edgeRef.sourceId;
    let targetId = edgeRef.targetId;

    if (sourceIndex > targetIndex) {
      [sourceId, targetId] = [targetId, sourceId];
    }

    const source = pointCollection.getById(sourceId);
    const target = pointCollection.getById(targetId);

    if (!source || !target) {
      console.warn(`edgeRefToEdgeModel: point not found: ${edgeRef.sourceId} or ${edgeRef.targetId}`);
      return null;
    }

    let modelName = edgeRef.modelName;

    if (!modelName) {
      let bestModel: string | null = null;
      let maxIntersection = -1;

      const sourceModels = new Set(source.embeddings.keys());

      // Ищем общую модель с максимальным пересечением активных размерностей.
      for (const [targetModelName, targetEmb] of target.embeddings.entries()) {
        if (sourceModels.has(targetModelName)) {
          const sourceEmb = source.embeddings.get(targetModelName)!;
          const intersection = sourceEmb.intersectionCount(targetEmb);

          if (intersection > maxIntersection) {
            maxIntersection = intersection;
            bestModel = targetModelName;
          }
        }
      }
      modelName = bestModel ?? undefined;
    }

    if (!modelName) {
      console.warn(`edgeRefToEdgeModel: no common embedding model for ${source.id} and ${target.id}`);
      return null;
    }

    const embSource = source.embeddings.get(modelName);
    const embTarget = target.embeddings.get(modelName);

    if (!embSource || !embTarget) {
      console.warn(`edgeRefToEdgeModel: missing embedding for model ${modelName}`);
      return null;
    }

    return new EdgeModel(source, target, 100, modelName);
  }

  /**
   * Улучшить соседей одной точки.
   *
   * Кандидаты:
   * 1. все текущие соседи — чтобы плохие существующие связи можно было удалить;
   * 2. соседи K соседей точки — exploitation;
   * 3. randomCandidates случайных точек — exploration.
   */
  private improvePoint(source: PointModel): boolean {
    const points = this.pointGraphManager.getPoints();
    const pointCollection = this.pointGraphManager.getPointCollection();
    const currentEdges = this.pointGraphManager.getEdgesForPoint(source.id);

    const scored: ScoredCandidate[] = [];
    const existingTargets = new Set<string>();
    const candidateIds = new Set<string>();

    for (const edge of currentEdges) {
      const otherId = edge.sourceId === source.id ? edge.targetId : edge.sourceId;
      existingTargets.add(otherId);
      candidateIds.add(otherId);

      const otherPoint = pointCollection.getById(otherId);
      if (!otherPoint) continue;

      const distance = this.calculateAverageCosineDistance(source, otherPoint);
      if (distance !== null) {
        scored.push({
          targetId: otherId,
          distance,
          model: edge,
          isNew: false,
        });
      }
    }

    const seedNeighborIds = currentEdges.map((edge) => (edge.sourceId === source.id ? edge.targetId : edge.sourceId)).slice(0, this.K);

    for (const neighborId of seedNeighborIds) {
      const neighborEdges = this.pointGraphManager.getEdgesForPoint(neighborId);
      for (const edge of neighborEdges.slice(0, this.K)) {
        const candidateId = edge.sourceId === neighborId ? edge.targetId : edge.sourceId;
        if (candidateId !== source.id) {
          candidateIds.add(candidateId);
        }
      }
    }

    for (let i = 0; i < this.randomCandidates; i++) {
      const randomIndex = Math.floor(Math.random() * points.length);
      const candidate = points[randomIndex];
      if (candidate.id !== source.id) {
        candidateIds.add(candidate.id);
      }
    }

    for (const candidateId of candidateIds) {
      if (existingTargets.has(candidateId)) continue;

      const target = pointCollection.getById(candidateId);
      if (!target) continue;

      const distance = this.calculateAverageCosineDistance(source, target);
      if (distance !== null) {
        scored.push({
          targetId: candidateId,
          distance,
          isNew: true,
        });
      }
    }

    scored.sort((a, b) => a.distance - b.distance);

    const topK = scored.slice(0, this.K);
    const topKTargets = new Set(topK.map((candidate) => candidate.targetId));
    let changed = false;

    for (const candidate of scored) {
      if (!candidate.isNew && !topKTargets.has(candidate.targetId) && candidate.model) {
        this.pointGraphManager.removeEdge(candidate.model);
        changed = true;
      }
    }

    for (const candidate of topK) {
      if (candidate.isNew) {
        this.pointGraphManager.addEdge({
          sourceId: source.id,
          targetId: candidate.targetId,
          modelName: "",
        });
        changed = true;
      }
    }

    return changed;
  }

  /**
   * Вычисляет СРЕДНЕЕ косинусное расстояние по всем общим моделям двух точек.
   * Возвращает null, если общих моделей нет.
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

  private cosineDistance(v1: number[], v2: number[]): number {
    if (!v1 || !v2 || v1.length === 0 || v2.length === 0 || v1.length !== v2.length) {
      return 1;
    }

    let dot = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < v1.length; i++) {
      dot += v1[i] * v2[i];
      norm1 += v1[i] * v1[i];
      norm2 += v2[i] * v2[i];
    }

    if (norm1 === 0 || norm2 === 0) return 1;
    return 1 - dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }
}
