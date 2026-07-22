// ModelManager.ts
import { AppMediator } from "./AppMediator";
import { PointModel } from "./models/PointModel";
import { EmbeddingModel } from "./models/EmbeddingModel";

export class ModelManager {
  private points: PointModel[] = [];
  private neighbors: Map<string, string[]> = new Map();
  private readonly K = 3; // количество соседей на точку
  private readonly maxCandidates = 9; // соседи соседей + текущие
  private distanceCache: Map<string, number> = new Map();
  private selectedModel: string; // имя модели, используемой для расстояний

  private unsubPoints: () => void;
  private unsubStep: () => void;

  constructor(
    private mediator: AppMediator,
    selectedModel: string = "default", // можно указать нужную модель
  ) {
    this.selectedModel = selectedModel;

    // 1. Подписка на модельные точки (с эмбеддингами)
    this.unsubPoints = this.mediator.onPointsModelReady((points: PointModel[]) => {
      this.points = points;
      this.initRandomNeighbors();
      this.emitEdges();
    });

    // 2. Подписка на команду шага улучшения
    this.unsubStep = this.mediator.onModelManagerStep(() => {
      this.improveNeighbors();
      this.emitEdges();
    });
  }

  public destroy(): void {
    this.unsubPoints();
    this.unsubStep();
  }

  // ========== Получение эмбеддинга для точки ==========
  private getEmbedding(point: PointModel): number[] | undefined {
    // Берём эмбеддинг по выбранной модели, если нет — пробуем первую попавшуюся
    const emb = point.embeddings.get(this.selectedModel);
    if (emb) return emb.value;
    // fallback: берём первый доступный эмбеддинг
    const first = point.embeddings.values().next().value;
    return first?.value;
  }

  // ========== Инициализация случайных соседей ==========
  private initRandomNeighbors(): void {
    const ids = this.points.map((p) => p.id);
    if (ids.length === 0) return;
    this.neighbors.clear();
    for (const id of ids) {
      const candidates = this.randomDistinct(ids, id, this.K);
      this.neighbors.set(id, candidates);
    }
  }

  private randomDistinct(allIds: string[], excludeId: string, count: number): string[] {
    const filtered = allIds.filter((id) => id !== excludeId);
    const shuffled = [...filtered];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
  }

  // ========== Вычисление расстояния между эмбеддингами ==========
  private distance(id1: string, id2: string): number {
    if (id1 === id2) return 0;
    const key = `${id1}|${id2}`;
    let d = this.distanceCache.get(key);
    if (d !== undefined) return d;

    const p1 = this.points.find((p) => p.id === id1);
    const p2 = this.points.find((p) => p.id === id2);
    if (!p1 || !p2) return Infinity;

    const v1 = this.getEmbedding(p1);
    const v2 = this.getEmbedding(p2);
    if (!v1 || !v2) return Infinity;

    let sum = 0;
    for (let i = 0; i < v1.length; i++) {
      const diff = v1[i] - v2[i];
      sum += diff * diff;
    }
    d = Math.sqrt(sum);
    this.distanceCache.set(key, d);
    return d;
  }

  // ========== Один шаг улучшения соседей ==========
  private improveNeighbors(): void {
    const allIds = Array.from(this.neighbors.keys());
    let changed = false;
    for (const id of allIds) {
      const current = this.neighbors.get(id) || [];
      // Собираем кандидатов: текущие соседи + соседи соседей
      const candidateSet = new Set<string>(current);
      for (const nid of current) {
        const neighborsOfNeighbor = this.neighbors.get(nid) || [];
        for (const nn of neighborsOfNeighbor) {
          if (nn !== id) candidateSet.add(nn);
        }
      }
      const candidates = Array.from(candidateSet);
      candidates.sort((a, b) => this.distance(id, a) - this.distance(id, b));
      const newNeighbors = candidates.slice(0, this.K);
      if (!this.arraysEqual(current, newNeighbors)) {
        this.neighbors.set(id, newNeighbors);
        changed = true;
      }
    }
    if (changed) {
      // Очищаем часть кэша, если он слишком большой
      if (this.distanceCache.size > 10000) {
        const entries = Array.from(this.distanceCache.entries());
        const toDelete = entries.slice(0, Math.floor(entries.length * 0.2));
        for (const [key] of toDelete) {
          this.distanceCache.delete(key);
        }
      }
    }
  }

  private arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const sa = [...a].sort();
    const sb = [...b].sort();
    for (let i = 0; i < sa.length; i++) {
      if (sa[i] !== sb[i]) return false;
    }
    return true;
  }

  // ========== Отправка рёбер ==========
  private emitEdges(): void {
    const edges: { sourceId: string; targetId: string; distance: number }[] = [];
    for (const [sourceId, targets] of this.neighbors.entries()) {
      for (const targetId of targets) {
        if (sourceId < targetId) {
          // добавляем каждое ребро один раз
          edges.push({
            sourceId,
            targetId,
            distance: this.distance(sourceId, targetId),
          });
        }
      }
    }
    this.mediator.edges = edges;
  }

  // ========== Метод для физики (EmbeddingEngine) ==========
  public getPairs(): { source: PointModel; target: PointModel }[] {
    const pointMap = new Map(this.points.map((p) => [p.id, p]));
    const pairs: { source: PointModel; target: PointModel }[] = [];
    for (const [sourceId, targets] of this.neighbors.entries()) {
      const source = pointMap.get(sourceId);
      if (!source) continue;
      for (const targetId of targets) {
        const target = pointMap.get(targetId);
        if (target) pairs.push({ source, target });
      }
    }
    return pairs;
  }
}
