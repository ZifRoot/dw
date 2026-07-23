// core/NeighborGraph.ts
import { EmbeddingModel } from "./models/EmbeddingModel";
import { PatternMatcher } from "./PatternMatcher";

export class NeighborGraph {
  private neighbors: Map<string, string[]> = new Map();
  private readonly K: number;
  private readonly maxCandidates: number;
  private matcher: PatternMatcher;

  constructor(K: number = 3, maxCandidates: number = 20, matcher: PatternMatcher) {
    this.K = K;
    this.maxCandidates = maxCandidates;
    this.matcher = matcher;
  }

  /** Инициализация случайными соседями */
  public initRandom(ids: string[]): void {
    this.neighbors.clear();
    for (const id of ids) {
      const candidates = this.randomDistinct(ids, id, this.K);
      this.neighbors.set(id, candidates);
    }
  }

  private randomDistinct(allIds: string[], excludeId: string, count: number): string[] {
    const filtered = allIds.filter(id => id !== excludeId);
    const shuffled = [...filtered];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
  }

  /** Получить текущих соседей для точки */
  public getNeighbors(id: string): string[] {
    return this.neighbors.get(id) ?? [];
  }

  /** Обновить соседей, используя двухэтапный поиск (бинарный + косинусный) */
  public improve(
    ids: string[],
    binaryMap: Map<string, EmbeddingModel>,
    vectorMap: Map<string, number[]>,
    cosineDistance: (v1: number[], v2: number[]) => number,
  ): void {
    let changed = false;
    for (const id of ids) {
      const current = this.neighbors.get(id) || [];
      const candidateSet = new Set<string>(current);
      for (const nid of current) {
        const neighborsOfNeighbor = this.neighbors.get(nid) || [];
        for (const nn of neighborsOfNeighbor) {
          if (nn !== id) candidateSet.add(nn);
        }
      }
      const candidateArray = Array.from(candidateSet);
      let bestCandidates: string[];
      if (candidateArray.length < this.K) {
        // Поиск по всем точкам
        bestCandidates = this.findBestCandidates(id, ids, binaryMap, vectorMap, cosineDistance);
      } else {
        bestCandidates = this.filterAndSortCandidates(id, candidateArray, binaryMap, vectorMap, cosineDistance);
        if (bestCandidates.length < this.K) {
          const existingSet = new Set(bestCandidates);
          const missing = this.K - bestCandidates.length;
          const extra = this.randomDistinct(ids.filter(x => !existingSet.has(x) && x !== id), id, missing);
          bestCandidates = [...bestCandidates, ...extra];
        }
      }
      if (!this.arraysEqual(current, bestCandidates)) {
        this.neighbors.set(id, bestCandidates);
        changed = true;
      }
    }
  }

  private findBestCandidates(
    id: string,
    allIds: string[],
    binaryMap: Map<string, EmbeddingModel>,
    vectorMap: Map<string, number[]>,
    cosineDistance: (v1: number[], v2: number[]) => number,
  ): string[] {
    const sourceBinary = binaryMap.get(id);
    if (!sourceBinary) return [];

    const candidates: string[] = [];
    for (const otherId of allIds) {
      if (otherId === id) continue;
      const otherBinary = binaryMap.get(otherId);
      if (!otherBinary) continue;
      if (sourceBinary.intersect(otherBinary).size > 0) {
        candidates.push(otherId);
      }
    }
    if (candidates.length === 0) {
      return this.randomDistinct(allIds, id, this.K);
    }
    if (candidates.length > this.maxCandidates) {
      // сортируем по patternScore и оставляем maxCandidates
      candidates.sort((a, b) => {
        const sa = sourceBinary.intersect(binaryMap.get(a)!).size;
        const sb = sourceBinary.intersect(binaryMap.get(b)!).size;
        return sb - sa;
      });
      candidates.splice(this.maxCandidates);
    }
    // Косинусное расстояние среди оставшихся
    const sourceVec = vectorMap.get(id);
    if (!sourceVec) return candidates.slice(0, this.K);
    candidates.sort((a, b) => {
      const va = vectorMap.get(a);
      const vb = vectorMap.get(b);
      if (!va || !vb) return 0;
      return cosineDistance(sourceVec, va) - cosineDistance(sourceVec, vb);
    });
    return candidates.slice(0, this.K);
  }

  private filterAndSortCandidates(
    id: string,
    candidates: string[],
    binaryMap: Map<string, EmbeddingModel>,
    vectorMap: Map<string, number[]>,
    cosineDistance: (v1: number[], v2: number[]) => number,
  ): string[] {
    const sourceBinary = binaryMap.get(id);
    if (!sourceBinary) return [];

    const filtered = candidates.filter(otherId => {
      const otherBinary = binaryMap.get(otherId);
      return otherBinary && sourceBinary.intersect(otherBinary).size > 0;
    });

    if (filtered.length === 0) {
      return this.randomDistinct(candidates, id, this.K);
    }

    filtered.sort((a, b) => {
      const sa = sourceBinary.intersect(binaryMap.get(a)!).size;
      const sb = sourceBinary.intersect(binaryMap.get(b)!).size;
      return sb - sa;
    });
    const top = filtered.slice(0, this.maxCandidates);
    const sourceVec = vectorMap.get(id);
    if (!sourceVec) return top.slice(0, this.K);
    top.sort((a, b) => {
      const va = vectorMap.get(a);
      const vb = vectorMap.get(b);
      if (!va || !vb) return 0;
      return cosineDistance(sourceVec, va) - cosineDistance(sourceVec, vb);
    });
    return top.slice(0, this.K);
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

  /** Получить все ребра (пары source-target) */
  public getAllEdgeIndexes(): { sourceId: string; targetId: string }[] {
    const result: { sourceId: string; targetId: string }[] = [];
    for (const [sourceId, targets] of this.neighbors.entries()) {
      for (const targetId of targets) {
        if (sourceId < targetId) {
          result.push({ sourceId, targetId });
        }
      }
    }
    return result;
  }
}