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
  // Храним ID рёбер вместо самих объектов для экономии памяти и избегания дублирования ссылок
  private adjacency: Map<string, Set<string>> = new Map();

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

    const hasForward = this.checkDirection(sourceId, targetId, modelName);
    const hasBackward = this.checkDirection(targetId, sourceId, modelName);

    if (hasForward && hasBackward) {
      return true;
    }
    if (hasForward || hasBackward) {
      console.warn(`[NeighborGraph] Inconsistent edge between ${sourceId} and ${targetId} for model "${modelName}". Only one direction present.`);
      return true; // считаем, что ребро существует, но с предупреждением
    }
    return false;
  }

  checkDirection(fromId: string, toId: string, modelName?: string): boolean {
    const edgeIds = this.adjacency.get(fromId);
    if (!edgeIds) return false;

    for (const edgeId of edgeIds) {
      const edge = this.edgeCollection.getById(edgeId);
      if (edge && edge.modelName === modelName) {
        // Проверяем, что ребро соединяет fromId и toId
        if (edge.sourceId === toId || edge.targetId === toId) {
          return true;
        }
      }
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

    // Добавляем ID в граф (в обе стороны)
    const { sourceId: src, targetId: tgt, id } = model;

    if (!this.adjacency.has(src)) {
      this.adjacency.set(src, new Set());
    }
    this.adjacency.get(src)!.add(id);

    if (!this.adjacency.has(tgt)) {
      this.adjacency.set(tgt, new Set());
    }
    this.adjacency.get(tgt)!.add(id);
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
      edges.delete(modelId);
      if (edges.size === 0) {
        this.adjacency.delete(pointId);
      }
    }
  }

  /**
   * Получить все рёбра, инцидентные данной точке
   */
  public getEdgesForPoint(id: string): EdgeModel[] {
    const edgeIds = this.adjacency.get(id);
    if (!edgeIds) return [];

    const result: EdgeModel[] = [];
    for (const edgeId of edgeIds) {
      const edge = this.edgeCollection.getById(edgeId);
      if (edge) result.push(edge);
    }
    return result;
  }

  /**
   * Получить id соседей точки
   */
  public getNeighbors(id: string): Set<string> {
    const edgeIds = this.adjacency.get(id);
    const neighbors = new Set<string>();

    if (edgeIds) {
      for (const edgeId of edgeIds) {
        const edge = this.edgeCollection.getById(edgeId);
        if (edge) {
          neighbors.add(edge.sourceId);
          neighbors.add(edge.targetId);
        }
      }
    }

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
