// core/NeighborGraph.ts
import { EdgeRef } from "./models/EdgeRef";
import { EdgeModel } from "./models/EdgeModel";
import { EntityCollection } from "./Scene/indexer";
import { IEdgeModelFactory } from "./IEdgeModelFactory";

/**
 * NeighborGraph – единое хранилище графа связей и плоского списка рёбер.
 * Обеспечивает консистентность: при добавлении ребра модель добавляется в оба направления.
 * При обнаружении несимметричности выдаётся предупреждение.
 */
export class NeighborGraph {
  private edgeCollection: EntityCollection<EdgeModel>;
  private adjacency: Map<string, EdgeModel[]> = new Map();

  constructor(private factory: IEdgeModelFactory) {
    this.edgeCollection = new EntityCollection<EdgeModel>((model) => model.id);
  }

  /**
   * Проверить наличие ребра.
   * Если ребро присутствует только в одном направлении, выдаётся предупреждение о неконсистентности.
   * Возвращает true, если ребро есть хотя бы в одном направлении.
   */
  public hasEdge(edgeRef: EdgeRef): boolean {
    const { sourceId, targetId, modelName } = edgeRef;
    if (sourceId === targetId) return false;

    const edgesFromSource = this.adjacency.get(sourceId);
    const hasForward = edgesFromSource ? edgesFromSource.some((e) => e.sourceId === targetId && e.modelName === modelName) : false;

    const edgesFromTarget = this.adjacency.get(targetId);
    const hasBackward = edgesFromTarget ? edgesFromTarget.some((e) => e.sourceId === sourceId && e.modelName === modelName) : false;

    if (hasForward && hasBackward) {
      return true;
    }
    if (hasForward || hasBackward) {
      console.warn(`[NeighborGraph] Inconsistent edge between ${sourceId} and ${targetId} for model "${modelName}". Only one direction present.`);
      return true; // считаем, что ребро существует, но с предупреждением
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

    // Добавляем в плоский список
    this.edgeCollection.add(model);

    // Добавляем в граф (в обе стороны)
    const { sourceId: src, targetId: tgt } = model;
    if (!this.adjacency.has(src)) {
      this.adjacency.set(src, []);
    }
    this.adjacency.get(src)!.push(model);

    if (!this.adjacency.has(tgt)) {
      this.adjacency.set(tgt, []);
    }
    this.adjacency.get(tgt)!.push(model);
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

  public removeFrom(pointId: string, modelId: string) {
    const edges = this.adjacency.get(pointId);
    if (edges) {
      const idx = edges.findIndex((e) => e.id === modelId);
      if (idx !== -1) {
        edges.splice(idx, 1);
        if (edges.length === 0) {
          this.adjacency.delete(pointId);
        }
      }
    }
  }

  /**
   * Получить все рёбра, инцидентные данной точке
   */
  public getEdgesForPoint(id: string): EdgeModel[] {
    return this.adjacency.get(id) ?? [];
  }

  /**
   * Получить id соседей точки
   */
  public getNeighbors(id: string): Set<string> {
    const neighbors = new Set(
      ...this.getEdgesForPoint(id)
        .map((e) => [e.sourceId, e.targetId])
        .flat(),
    );

    neighbors.delete(id);
    return neighbors;
  }

  /**
   * Получить модель ребра по id
   */
  public getEdgeById(id: string): EdgeModel | undefined {
    return this.edgeCollection.getById(id);
  }

  /**
   * Получить все модели рёбер (уникальные)
   */
  public getAllEdgeModels(): EdgeModel[] {
    return this.edgeCollection.items;
  }

  /**
   * Получить все рёбра в виде EdgeRef
   */
  public getAllEdgeRefs(): EdgeRef[] {
    const result: EdgeRef[] = [];
    for (const model of this.edgeCollection.items) {
      result.push({
        sourceId: model.sourceId,
        targetId: model.targetId,
        modelName: model.modelName,
      });
    }
    return result;
  }

  /**
   * Очистить граф
   */
  public clear(): void {
    this.adjacency.clear();
    this.edgeCollection.clear();
  }
}
