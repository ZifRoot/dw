// core/NeighborGraph.ts
import { EdgeRef } from "./models/EdgeRef";
import { EdgeModel } from "./models/EdgeModel";
import { EntityCollection } from "./EntityCollection";
import { IEdgeModelFactory } from "./IEdgeModelFactory";

/**
 * NeighborGraph – единое хранилище графа связей и плоского списка рёбер.
 * Обеспечивает консистентность: при добавлении ребра модель добавляется в оба направления.
 * При обнаружении несимметричности выдаётся предупреждение.
 */
export class NeighborGraph {
  private edgeCollection: EntityCollection<EdgeModel>;
  private adjacency: Map<string, Set<string>> = new Map();

  constructor(private factory: IEdgeModelFactory) {
    this.edgeCollection = new EntityCollection<EdgeModel>((model) => model.id);
  }

  // ───────────────────── private helpers ─────────────────────

  private hasDirection(fromId: string, toId: string, modelName?: string): boolean {
    const edgeIds = this.adjacency.get(fromId);
    if (!edgeIds) return false;

    return [...edgeIds]
      .map((id) => this.edgeCollection.getById(id))
      .filter((e): e is EdgeModel => e != null)
      .some((e) => (e.sourceId === toId || e.targetId === toId) && e.modelName === modelName);
  }

  private addToAdjacency(pointId: string, edgeId: string): void {
    if (!this.adjacency.has(pointId)) {
      this.adjacency.set(pointId, new Set());
    }
    this.adjacency.get(pointId)!.add(edgeId);
  }

  // ───────────────────── public API ─────────────────────

  /**
   * Проверить наличие ребра.
   * Если ребро присутствует только в одном направлении, выдаётся предупреждение.
   */
  public hasEdge(edgeRef: EdgeRef): boolean {
    const { sourceId, targetId, modelName } = edgeRef;
    if (sourceId === targetId) return false;

    const hasForward = this.hasDirection(sourceId, targetId, modelName);
    const hasBackward = this.hasDirection(targetId, sourceId, modelName);

    if (hasForward && hasBackward) return true;

    if (hasForward || hasBackward) {
      console.warn(`[NeighborGraph] Inconsistent edge between ${sourceId} and ${targetId} for model "${modelName}". Only one direction present.`);
      return true;
    }

    return false;
  }

  /**
   * Добавить ребро (кандидат на создание)
   */
  public addEdge(edgeRef: EdgeRef): void {
    const { sourceId, targetId } = edgeRef;
    if (sourceId === targetId) return;
    if (this.hasEdge(edgeRef)) return;

    const model = this.factory.create(edgeRef);
    if (!model) return;

    this.edgeCollection.add(model);
    this.addToAdjacency(model.sourceId, model.id);
    this.addToAdjacency(model.targetId, model.id);
  }

  /**
   * Удалить ребро по существующей модели
   */
  public removeEdge(model: EdgeModel): void {
    const { sourceId, targetId, id } = model;
    this.edgeCollection.removes([id]);
    this.removeFrom(sourceId, id);
    this.removeFrom(targetId, id);
  }

  public removeFrom(pointId: string, edgeId: string): void {
    const edges = this.adjacency.get(pointId);
    if (!edges) return;

    edges.delete(edgeId);
    if (edges.size === 0) {
      this.adjacency.delete(pointId);
    }
  }

  /**
   * Получить все рёбра, инцидентные данной точке
   */
  public getEdgesForPoint(id: string): EdgeModel[] {
    const edgeIds = this.adjacency.get(id);
    if (!edgeIds) return [];

    return [...edgeIds].map((edgeId) => this.edgeCollection.getById(edgeId)).filter((e): e is EdgeModel => e != null);
  }

  /**
   * Получить id соседей точки
   */
  public getNeighbors(id: string): Set<string> {
    const neighbors = new Set(this.getEdgesForPoint(id).flatMap((e) => [e.sourceId, e.targetId]));
    neighbors.delete(id);
    return neighbors;
  }

  /** Получить модель ребра по id */
  public getEdgeById(id: string): EdgeModel | null {
    return this.edgeCollection.getById(id);
  }

  /** Получить все модели рёбер (уникальные) */
  public getAllEdgeModels(): EdgeModel[] {
    return this.edgeCollection.items;
  }

  /** Получить прямую ссылку на живой массив рёбер (не копию) */
  public getEdgesArrayDirect(): EdgeModel[] {
    return this.edgeCollection.items;
  }

  /** Получить EntityCollection для рёбер */
  public getEdgeCollection(): EntityCollection<EdgeModel> {
    return this.edgeCollection;
  }

  /** Получить все рёбра в виде EdgeRef */
  public getAllEdgeRefs(): EdgeRef[] {
    return this.edgeCollection.items.map((model) => ({
      sourceId: model.sourceId,
      targetId: model.targetId,
      modelName: model.modelName,
    }));
  }

  /** Очистить граф */
  public clear(): void {
    this.adjacency.clear();
    this.edgeCollection.clear();
  }
}
