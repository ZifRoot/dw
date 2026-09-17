// core/ModelManager.ts
import { AppMediator } from "./AppMediator";
import { PointModel } from "./models/PointModel";
import { EdgeModel } from "./models/EdgeModel";
import { PointGraphManager } from "./PointGraphManager";

interface ScoredCandidate {
  targetId: string;
  distance: number;
  model?: EdgeModel;
  isNew: boolean;
}

/**
 * ModelManager – строит и постепенно улучшает граф ближайших соседей.
 *
 * Поиск кандидатов использует текущих соседей точки, соседей этих соседей
 * и небольшую случайную выборку. Поэтому вместо полного перебора всех точек
 * алгоритм работает с локальной окрестностью графа и постепенно улучшает её.
 *
 * Улучшение выполняется инкрементально: за один requestAnimationFrame
 * обрабатывается только столько точек, сколько помещается в заданный бюджет
 * времени. Это позволяет не блокировать основной поток браузера.
 */
export class ModelManager {
  private readonly K: number;
  private readonly randomCandidates: number;
  private readonly frameBudgetMs: number;

  private pointIndex = 0;
  private iterationChanged = false;
  private rafId: number | null = null;
  private generation = 0;
  private isRunningFrame = false;

  private readonly unsubGraphUpdated: () => void;
  private readonly unsubStep: () => void;

  constructor(
    private mediator: AppMediator,
    private pointGraphManager: PointGraphManager,
    K: number = 3,
    randomCandidates: number = 3,
    frameBudgetMs: number = 6,
  ) {
    this.K = Math.max(1, K);
    this.randomCandidates = Math.max(0, randomCandidates);
    this.frameBudgetMs = Math.max(1, frameBudgetMs);

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

  public destroy(): void {
    this.stopOptimization();
    this.unsubGraphUpdated();
    this.unsubStep();
  }

  /**
   * Запустить непрерывное улучшение графа через requestAnimationFrame.
   */
  private startOptimization(): void {
    if (this.rafId !== null) return;
    if (this.pointGraphManager.getPoints().length < 2) return;

    this.generation++;
    const generation = this.generation;
    this.rafId = requestAnimationFrame(() => this.runFrame(generation));
  }

  /**
   * Остановить запланированное улучшение графа.
   */
  private stopOptimization(): void {
    this.generation++;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Выполнить один временной квант оптимизации.
   *
   * Важно: requestAnimationFrame сам по себе не делает большой расчёт
   * неблокирующим. Поэтому внутри одного кадра явно ограничиваем объём
   * работы по performance.now().
   */
  private runFrame(generation: number): void {
    this.rafId = null;

    if (generation !== this.generation) return;

    const points = this.pointGraphManager.getPoints();
    if (points.length < 2) return;

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
      // сошлась и можно остановить requestAnimationFrame.
      if (!iterationChanged) {
        return;
      }
    } else if (graphChanged) {
      this.iterationChanged = true;
    }

    this.rafId = requestAnimationFrame(() => this.runFrame(generation));
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
