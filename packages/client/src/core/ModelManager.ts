// core/ModelManager.ts
import { AppMediator } from "./AppMediator";
import { AnimationCallback, AnimationEngine } from "./Engines/AnimationEngine";
import { EdgeModel } from "./models/EdgeModel";
import { EdgeRef } from "./models/EdgeRef";
import { PointModel } from "./models/PointModel";
import { PointGraphManager } from "./collections/PointGraphManager";
import { IEdgeFactory } from "./interfaces/IEdgeFactory";
import { cosineDistance } from "@utils/vector";

interface ScoredCandidate {
  targetId: string;
  distance: number;
  model?: EdgeModel;
  isNew: boolean;
}

export interface ModelPointCount {
  modelName: string;
  pointCount: number;
}

/**
 * Управляет построением и постепенной оптимизацией графа ближайших соседей.
 *
 * Для каждой точки рассматриваются:
 * - существующие соседи;
 * - соседи ближайших существующих соседей;
 * - небольшая случайная выборка.
 *
 * Оптимизация выполняется через AnimationEngine, поэтому тяжёлая работа
 * разбивается на небольшие кванты и не блокирует UI надолго.
 */
export class ModelManager {
  private readonly K: number;
  private readonly randomCandidates: number;
  private readonly frameBudgetMs: number;
  private readonly pointGraphManager: PointGraphManager;

  /** Модель эмбеддинга, по которой сейчас строится граф. */
  private activeModelName: string | null = null;

  private pointIndex = 0;
  private iterationChanged = false;
  private optimizationCallback: AnimationCallback | null = null;
  private destroyed = false;

  private readonly unsubStep: () => void;

  constructor(
    private readonly mediator: AppMediator,
    private readonly animation: AnimationEngine,
    K: number = 3,
    randomCandidates: number = 3,
    frameBudgetMs: number = 6,
  ) {
    this.K = Math.max(1, Math.floor(K));
    this.randomCandidates = Math.max(0, Math.floor(randomCandidates));
    this.frameBudgetMs = Math.max(1, frameBudgetMs);

    const edgeModelFactory: IEdgeFactory = {
      create: (edgeRef) => this.edgeRefToEdgeModel(edgeRef),
    };

    this.pointGraphManager = new PointGraphManager(this.mediator, edgeModelFactory);

    this.unsubStep = this.mediator.onModelManagerStep(() => {
      this.toggleOptimization();
    });
  }

  public getPointGraphManager(): PointGraphManager {
    return this.pointGraphManager;
  }

  /**
   * Переключить состояние оптимизации.
   *
   * Повторный вызов во время работы останавливает оптимизацию.
   * Следующий вызов снова запускает её.
   */
  public toggleOptimization(): void {
    if (this.optimizationCallback !== null) {
      this.stopOptimization();
      return;
    }

    this.startOptimization();
  }

  /**
   * Возвращает модели, отсортированные по количеству точек,
   * содержащих embedding этой модели.
   *
   * Одна точка учитывается не более одного раза для каждой модели.
   */
  public getModelsByPointCount(): ModelPointCount[] {
    const modelPointCounts = new Map<string, number>();

    for (const point of this.pointGraphManager.getPoints()) {
      for (const modelName of point.embeddings.keys()) {
        modelPointCounts.set(modelName, (modelPointCounts.get(modelName) ?? 0) + 1);
      }
    }

    return Array.from(modelPointCounts.entries())
      .map(([modelName, pointCount]) => ({ modelName, pointCount }))
      .sort((a, b) => b.pointCount - a.pointCount);
  }

  public destroy(): void {
    if (this.destroyed) return;

    this.destroyed = true;
    this.stopOptimization();
    this.unsubStep();
  }

  /**
   * Запустить оптимизацию.
   *
   * Выбирается модель, которая присутствует у наибольшего количества точек.
   * Старые рёбра других моделей удаляются, после чего граф постепенно
   * перестраивается по выбранной модели.
   */
  private startOptimization(): void {
    if (this.destroyed) return;

    const points = this.pointGraphManager.getPoints();
    if (points.length < 2) {
      this.stopOptimization();
      return;
    }

    const model = this.getModelsByPointCount()[0]?.modelName;
    if (!model) {
      this.stopOptimization();
      return;
    }

    const modelChanged = this.activeModelName !== model;
    this.activeModelName = model;

    if (modelChanged) {
      this.pointIndex = 0;
      this.iterationChanged = false;

      const edgesToRemove = this.pointGraphManager
        .getEdgesArray()
        .filter((edge): edge is EdgeModel => edge instanceof EdgeModel && edge.modelName !== model);

      if (edgesToRemove.length > 0) {
        this.pointGraphManager.removeEdges(edgesToRemove);
        this.mediator.pointsGraphUpdated();
      }
    }

    if (this.optimizationCallback === null) {
      this.optimizationCallback = this.animation.addCallback(() => this.runStep());
    }
  }

  /**
   * Остановить оптимизацию и сбросить состояние текущего прохода.
   */
  private stopOptimization(): void {
    if (this.optimizationCallback !== null) {
      this.optimizationCallback();
      this.optimizationCallback = null;
    }

    this.pointIndex = 0;
    this.iterationChanged = false;
  }

  /**
   * Выполнить один временной квант оптимизации.
   *
   * За один callback обрабатываются точки, пока не исчерпан frameBudgetMs.
   * После полного прохода без изменений граф считается сошедшимся.
   */
  private runStep(): void {
    if (this.destroyed) return;

    const points = this.pointGraphManager.getPoints();
    if (points.length < 2 || this.activeModelName === null) {
      this.stopOptimization();
      return;
    }

    const frameStart = performance.now();
    let graphChanged = false;

    while (
      this.pointIndex < points.length &&
      performance.now() - frameStart < this.frameBudgetMs
    ) {
      graphChanged = this.improvePoint(points[this.pointIndex]) || graphChanged;
      this.pointIndex++;
    }

    if (graphChanged) {
      this.iterationChanged = true;
      this.mediator.pointsGraphUpdated();
    }

    if (this.pointIndex < points.length) return;

    this.pointIndex = 0;

    if (!this.iterationChanged) {
      this.stopOptimization();
      return;
    }

    this.iterationChanged = false;
  }

  /**
   * Создать EdgeModel из EdgeRef в контексте ModelManager.
   */
  private edgeRefToEdgeModel(edgeRef: EdgeRef): EdgeModel | null {
    const pointCollection = this.pointGraphManager.getPointCollection();

    let sourceId = edgeRef.sourceId;
    let targetId = edgeRef.targetId;

    const sourceIndex = pointCollection.indexMap.get(sourceId);
    const targetIndex = pointCollection.indexMap.get(targetId);

    if (sourceIndex == null || targetIndex == null) {
      console.warn(
        `[ModelManager] Point not found for edge: ${sourceId} -> ${targetId}`,
      );
      return null;
    }

    // Нормализуем порядок концов для консистентности id ребра.
    if (sourceIndex > targetIndex) {
      [sourceId, targetId] = [targetId, sourceId];
    }

    const source = pointCollection.getById(sourceId);
    const target = pointCollection.getById(targetId);

    if (!source || !target) {
      console.warn(
        `[ModelManager] Point not found for edge: ${edgeRef.sourceId} -> ${edgeRef.targetId}`,
      );
      return null;
    }

    const modelName = edgeRef.modelName || this.activeModelName;
    if (!modelName) {
      console.warn(
        `[ModelManager] No embedding model for edge: ${source.id} -> ${target.id}`,
      );
      return null;
    }

    if (!source.embeddings.has(modelName) || !target.embeddings.has(modelName)) {
      console.warn(
        `[ModelManager] Missing embedding "${modelName}" for ${source.id} or ${target.id}`,
      );
      return null;
    }

    return new EdgeModel(source, target, modelName);
  }

  /**
   * Улучшить соседей одной точки.
   *
   * Кандидаты:
   * 1. текущие соседи — чтобы плохие связи можно было удалить;
   * 2. соседи K ближайших соседей точки — exploitation;
   * 3. случайные точки — exploration.
   */
  private improvePoint(source: PointModel): boolean {
    const modelName = this.activeModelName;
    if (!modelName) return false;

    const currentEdges = this.pointGraphManager
      .getEdgesForPoint(source.id)
      .filter((edge): edge is EdgeModel => edge instanceof EdgeModel);

    const scored: ScoredCandidate[] = currentEdges.map((edge) => ({
      targetId: this.getOtherPointId(edge, source.id),
      distance: edge.cosineDistance,
      model: edge,
      isNew: false,
    }));

    const existingTargets = new Set(scored.map((candidate) => candidate.targetId));
    const seedNeighbors = scored
      .slice()
      .sort((a, b) => a.distance - b.distance)
      .slice(0, this.K)
      .map((candidate) => candidate.targetId);

    const candidateIds = new Set<string>();

    for (const neighborId of seedNeighbors) {
      const neighborEdges = this.pointGraphManager
        .getEdgesForPoint(neighborId)
        .filter((edge): edge is EdgeModel => edge instanceof EdgeModel);

      for (const edge of neighborEdges) {
        if (candidateIds.size >= this.K * this.K) break;

        const candidateId = this.getOtherPointId(edge, neighborId);
        if (candidateId !== source.id) {
          candidateIds.add(candidateId);
        }
      }
    }

    for (const candidateId of this.getRandomCandidates(source)) {
      candidateIds.add(candidateId);
    }

    for (const candidateId of candidateIds) {
      if (existingTargets.has(candidateId)) continue;

      const target = this.pointGraphManager.getPointById(candidateId);
      if (!target) continue;

      const distance = this.calculateCosineDistance(source, target, modelName);
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
      if (
        !candidate.isNew &&
        !topKTargets.has(candidate.targetId) &&
        candidate.model
      ) {
        this.pointGraphManager.removeEdge(candidate.model);
        changed = true;
      }
    }

    for (const candidate of topK) {
      if (!candidate.isNew) continue;

      const edge = this.pointGraphManager.addEdge({
        sourceId: source.id,
        targetId: candidate.targetId,
        modelName,
      });

      changed = edge instanceof EdgeModel || changed;
    }

    return changed;
  }

  /**
   * Вернуть id второго конца ребра.
   */
  private getOtherPointId(edge: EdgeModel, pointId: string): string {
    return edge.sourceId === pointId ? edge.targetId : edge.sourceId;
  }

  /**
   * Получить случайные id точек, имеющих активную модель.
   *
   * Выбираем без повторений и без создания копии всего массива точек.
   */
  private getRandomCandidates(source: PointModel): string[] {
    const modelName = this.activeModelName;
    if (!modelName || this.randomCandidates === 0) return [];

    const points = this.pointGraphManager.getPoints();
    if (points.length < 2) return [];

    const result = new Set<string>();
    const maxAttempts = Math.max(points.length * 2, this.randomCandidates * 10);

    for (let attempt = 0; attempt < maxAttempts && result.size < this.randomCandidates; attempt++) {
      const index = Math.floor(Math.random() * points.length);
      const candidate = points[index];

      if (
        candidate.id !== source.id &&
        candidate.embeddings.has(modelName)
      ) {
        result.add(candidate.id);
      }
    }

    return [...result];
  }

  /**
   * Вычисляет косинусное расстояние двух точек по активной модели.
   * Возвращает null, если у одной из точек нет нужного embedding.
   */
  private calculateCosineDistance(
    p1: PointModel,
    p2: PointModel,
    modelName: string,
  ): number | null {
    const emb1 = p1.embeddings.get(modelName);
    const emb2 = p2.embeddings.get(modelName);

    if (!emb1 || !emb2) return null;

    return cosineDistance(emb1.value, emb2.value);
  }
}
