// core/PointGraphManager.ts
import { PointModel } from "../models/PointModel";
import { EdgeModel } from "../models/EdgeModel";
import { EntityCollection } from "../collections/EntityCollection";
import { NeighborGraph } from "../collections/NeighborGraph";
import { EdgeRef } from "../models/EdgeRef";
import { EdgeRefs } from "../models/EdgeRefs";
import "@utils/array-extensions";
import { AppMediator } from "../AppMediator";
import { IEdgeModelFactory } from "../interfaces/IEdgeModelFactory";

/**
 * PointGraphManager – инкапсулирует управление коллекцией точек и графом связей.
 * Гарантирует консистентность: при изменении точек автоматически очищает "висячие" рёбра.
 */
export class PointGraphManager {
  private pointCollection: EntityCollection<PointModel> = new EntityCollection((p) => p.id);
  private graph: NeighborGraph;

  constructor(
    private mediator: AppMediator,
    factory: IEdgeModelFactory,
  ) {
    this.graph = new NeighborGraph(factory);
  }

  /**
   * Обновить коллекцию точек и синхронизировать граф.
   */
  public updatePoints(points: PointModel[]): void {
    const oldIds = new Set(this.pointCollection.indexMap.keys());
    const newIds = new Set(points.map((p) => p.id));

    const removedIds = [...oldIds].filter((id) => !newIds.has(id));
    this.removeEdgesForPoints(removedIds);

    this.pointCollection.clear();
    this.pointCollection._setPoints(points, [], []);
  }

  /**
   * Удалить точки через менеджер графа.
   * Сначала удаляются все инцидентные рёбра, затем сами точки.
   */
  public removePoints(ids: string[]): void {
    if (ids.length === 0) return;

    const existingIds = ids.filter((id) => this.pointCollection.indexMap.has(id));
    if (existingIds.length === 0) return;

    this.removeEdgesForPoints(existingIds);
    this.pointCollection.removes(existingIds);
    this.mediator.pointsGraphUpdated();
  }

  /**
   * Обновить коллекцию точек и синхронизировать граф.
   */
  public update(points: PointModel[], edges: EdgeRefs): void {
    this.updatePoints(points);
    this.initFromRefs(edges);
    this.mediator.pointsGraphUpdated();
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
  public initRandom(K: number = 3): void {
    const ids = this.getPointIds();
    this.graph.clear();
    if (ids.length < 2) return;

    for (const sourceId of ids) {
      const point = this.pointCollection.getById(sourceId);
      if (!point) continue;

      const sourceModels = new Set(point.embeddings.keys());

      // Фильтруем только те точки, у которых есть хотя бы одна общая модель
      const validCandidates = ids.filter((targetId) => {
        if (targetId === sourceId) return false;
        const targetPoint = this.pointCollection.getById(targetId);
        if (!targetPoint) return false;

        for (const model of targetPoint.embeddings.keys()) {
          if (sourceModels.has(model)) return true;
        }
        return false;
      });

      const neighbors = [...validCandidates].shuffle().slice(0, Math.min(K, validCandidates.length));

      for (const targetId of neighbors) {
        // modelName оставляем пустым, фабрика сама выберет лучшую общую модель.
        this.graph.addEdge({ sourceId, targetId, modelName: "" });
      }
    }
  }

  /**
   * Инициализировать граф из сохранённых связей (вместо initRandom).
   * Пропускает рёбра с несуществующими концами; фабрика сама отбрасывает рёбра,
   * у которых нет общей модели эмбеддинга.
   */
  public initFromRefs(refs: EdgeRefs): void {
    this.graph.clear();
    for (const ref of refs) {
      if (ref.modelName == null) continue;
      this.graph.addEdge(ref);
    }
  }

  public addEdge(edgeRef: EdgeRef) {
    return this.graph.addEdge(edgeRef);
  }

  /**
   * Удалить ребро по модели.
   */
  public removeEdge(model: EdgeModel): void {
    this.graph.removeEdge(model);
  }

  /**
   * Удалить ребро по модели.
   */
  public removeEdges(model: EdgeModel[]): void {
    this.graph.removeEdges(model);
  }

  /**
   * Получить точку по идентификатору.
   */
  public getPointById(id: string): PointModel | null {
    return this.pointCollection.getById(id) ?? null;
  }

  /**
   * Получить все рёбра, инцидентные данной точке.
   */
  public getEdgesForPoint(id: string): EdgeModel[] {
    return this.graph.getEdgesForPoint(id);
  }

  public getPoints(): PointModel[] {
    return this.pointCollection.items;
  }

  /**
   * Получить ссылку на живой массив точек (не копию).
   * Используется сценами для прямого доступа без синхронизации.
   */
  public getPointsArray(): PointModel[] {
    return this.pointCollection.items;
  }

  /**
   * Получить ссылку на живой массив рёбер (не копию).
   * Используется сценами для прямого доступа без синхронизации.
   */
  public getEdgesArray(): EdgeModel[] {
    return this.graph.getEdgesArrayDirect();
  }

  /**
   * Получить EntityCollection для рёбер.
   */
  public getEdgeCollection(): EntityCollection<EdgeModel> {
    return this.graph.getEdgeCollection();
  }

  public getPointIds(): string[] {
    return Array.from(this.pointCollection.indexMap.keys());
  }

  /**
   * Оставлен для совместимости с существующим кодом.
   * Изменение количества точек должно выполняться через методы PointGraphManager.
   */
  public getPointCollection(): EntityCollection<PointModel> {
    return this.pointCollection;
  }

  public clear(): void {
    this.pointCollection.clear();
    this.graph.clear();
  }

  private removeEdgesForPoints(ids: string[]): void {
    for (const id of ids) {
      const edges = this.graph.getEdgesForPoint(id);
      for (const edge of edges) {
        this.graph.removeEdge(edge);
      }
    }
  }
}
