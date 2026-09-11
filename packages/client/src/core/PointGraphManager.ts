// core/PointGraphManager.ts
import { PointModel } from "./models/PointModel";
import { EntityCollection } from "./Scene/indexer";
import { NeighborGraph } from "./NeighborGraph";
import { EdgeRef } from "./models/EdgeRef";
import { edgeIndexToEdgeModel } from "./edge-utils";
import "@utils/array-extensions";

export class PointGraphManager {
  private pointCollection: EntityCollection<PointModel> = new EntityCollection((p) => p.id);
  private graph: NeighborGraph;

  constructor() {
    this.graph = new NeighborGraph({
      create: (edgeRef) => edgeIndexToEdgeModel(edgeRef, this.pointCollection),
    });
  }

  public updatePoints(points: PointModel[]): void {
    const oldIds = new Set(this.pointCollection.indexMap.keys());
    const newIds = new Set(points.map((p) => p.id));

    this.pointCollection.clear();
    this.pointCollection._setPoints(points, [], []);

    const removedIds = [...oldIds].filter((id) => !newIds.has(id));
    for (const removedId of removedIds) {
      const edges = this.graph.getEdgesForPoint(removedId);
      for (const edge of edges) {
        this.graph.removeEdge(edge);
      }
    }
  }

  /**
   * Найти общую модель эмбеддинга между двумя точками.
   */
  public getCommonModel(id1: string, id2: string): string | null {
    const point1 = this.pointCollection.getById(id1);
    const point2 = this.pointCollection.getById(id2);
    if (!point1 || !point2) return null;

    const models1 = [...point1.embeddings.keys()];
    const models2 = [...point2.embeddings.keys()];
    const common = models1.filter((m) => models2.includes(m));
    return common.length > 0 ? common[0] : null;
  }

  /**
   * Инициализировать граф случайными связями (до K на точку).
   * Создаёт связи только между точками с общей моделью эмбеддинга.
   */
  public initRandom(ids: string[], K: number = 3): void {
    this.graph.clear();
    if (ids.length < 2) return;

    for (const sourceId of ids) {
      const candidates = ids.filter((id) => id !== sourceId);
      const validCandidates = candidates.filter((targetId) => {
        return this.getCommonModel(sourceId, targetId) !== null;
      });

      const neighbors = [...validCandidates].shuffle().slice(0, Math.min(K, validCandidates.length));

      for (const targetId of neighbors) {
        const modelName = this.getCommonModel(sourceId, targetId);
        if (!modelName) continue;

        this.graph.addEdge({ sourceId, targetId, modelName });
      }
    }
  }

  public addEdge(edgeRef: EdgeRef): void {
    this.graph.addEdge(edgeRef);
  }

  public getPoints(): PointModel[] {
    return this.pointCollection.items;
  }

  public getPointIds(): string[] {
    return Array.from(this.pointCollection.indexMap.keys());
  }

  public getPointCollection(): EntityCollection<PointModel> {
    return this.pointCollection;
  }

  public getAllEdgeRefs(): EdgeRef[] {
    return this.graph.getAllEdgeRefs();
  }

  public clear(): void {
    this.pointCollection.clear();
    this.graph.clear();
  }
}
