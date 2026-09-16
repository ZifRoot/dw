// core/PointGraphManager.ts
import { PointModel } from "./models/PointModel";
import { EdgeModel } from "./models/EdgeModel";
import { EntityCollection } from "./EntityCollection";
import { NeighborGraph } from "./NeighborGraph";
import { EdgeRef } from "./models/EdgeRef";
import { EdgeRefs } from "./models/EdgeRefs";
import "@utils/array-extensions";
import { AppMediator } from "./AppMediator";

export interface EdgeModelOptions {
  modelName?: string;
  distance?: number;
  color?: string;
  cosineDistance?: number;
  intersectionCount?: number;
  intersectionSet?: Set<number>;
}

/**
 * PointGraphManager – инкапсулирует управление коллекцией точек и графом связей.
 * Гарантирует консистентность: при изменении точек автоматически очищает "висячие" рёбра.
 */
export class PointGraphManager {
  private pointCollection: EntityCollection<PointModel> = new EntityCollection((p) => p.id);
  private graph: NeighborGraph;

  constructor(private mediator: AppMediator) {
    this.graph = new NeighborGraph({
      create: (edgeRef) => this.edgeIndexToEdgeModel(edgeRef),
    });
  }

  /**
   * Преобразовать EdgeRef в EdgeModel, используя внутреннюю коллекцию точек.
   * Инкапсулирует логику преобразования ссылок на рёбра в модели рёбер.
   */
  public edgeIndexToEdgeModel(edgeIndex: EdgeRef, options: EdgeModelOptions = {}): EdgeModel | null {
    const sourceIndex = this.pointCollection.indexMap.get(edgeIndex.sourceId);
    const targetIndex = this.pointCollection.indexMap.get(edgeIndex.targetId);

    if (sourceIndex == null || targetIndex == null) {
      console.warn(`edgeIndexToEdgeModel: point not found: ${edgeIndex.sourceId} or ${edgeIndex.targetId}`);
      return null;
    }

    // Нормализуем порядок source/target по индексу для консистентности id ребра
    // Используем локальные переменные, не мутируем входной параметр
    let sourceId = edgeIndex.sourceId;
    let targetId = edgeIndex.targetId;

    if (sourceIndex > targetIndex) {
      [sourceId, targetId] = [targetId, sourceId];
    }

    const source = this.pointCollection.getById(sourceId);
    const target = this.pointCollection.getById(targetId);

    if (!source || !target) {
      console.warn(`edgeIndexToEdgeModel: point not found: ${edgeIndex.sourceId} or ${edgeIndex.targetId}`);
      return null;
    }

    // Определяем модель для связи
    let modelName = edgeIndex.modelName ?? options.modelName;

    if (!modelName) {
      let bestModel: string | null = null;
      let maxIntersection = -1;

      const sourceModels = new Set(source.embeddings.keys());

      // Ищем общую модель с максимальным пересечением активных размерностей
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
      console.warn(`edgeIndexToEdgeModel: no common embedding model for ${source.id} and ${target.id}`);
      return null;
    }

    const embSource = source.embeddings.get(modelName);
    const embTarget = target.embeddings.get(modelName);

    if (!embSource || !embTarget) {
      console.warn(`edgeIndexToEdgeModel: missing embedding for model ${modelName}`);
      return null;
    }

    return new EdgeModel(source, target, options.distance ?? 100, modelName);
  }

  /**
   * Обновить коллекцию точек и синхронизировать граф.
   */
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
        // modelName оставляем пустым, фабрика сама выберет лучшую общую модель
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

  public addEdge(edgeRef: EdgeRef): void {
    this.graph.addEdge(edgeRef);
  }

  /**
   * Удалить ребро по модели.
   */
  public removeEdge(model: EdgeModel): void {
    this.graph.removeEdge(model);
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

  public getPointCollection(): EntityCollection<PointModel> {
    return this.pointCollection;
  }

  public getAllEdgeRefs(): EdgeRef[] {
    return this.graph.getAllEdgeRefs();
  }

  /**
   * Преобразовать массив EdgeRef в массив EdgeModel, используя внутреннюю коллекцию точек.
   * Инкапсулирует логику преобразования ссылок на рёбра в модели рёбер.
   */
  public edgeIndexesToEdgeModels(edgeIndexes: EdgeRef[], options: EdgeModelOptions = {}): EdgeModel[] {
    const result: EdgeModel[] = [];
    for (const idx of edgeIndexes) {
      const model = this.edgeIndexToEdgeModel(idx, options);
      if (model) result.push(model);
    }
    return result;
  }

  public clear(): void {
    this.pointCollection.clear();
    this.graph.clear();
  }
}
