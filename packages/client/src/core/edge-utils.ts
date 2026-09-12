// core/utils/edge-utils.ts
import { EntityCollection } from "./Scene/indexer";
import { EdgeModel } from "./models/EdgeModel";
import { EdgeRef } from "./models/EdgeRef";
import { EdgeRefs } from "./models/EdgeRefs";
import { PointModel } from "./models/PointModel";

export interface EdgeModelOptions {
  modelName?: string;
  distance?: number;
  color?: string;
  cosineDistance?: number;
  intersectionCount?: number;
  intersectionSet?: Set<number>;
}

export function edgeIndexToEdgeModel(
  edgeIndex: EdgeRef,
  pointCollection: EntityCollection<PointModel>,
  options: EdgeModelOptions = {},
): EdgeModel | null {
  const sourceIndex = pointCollection.indexMap.get(edgeIndex.sourceId);
  const targetIndex = pointCollection.indexMap.get(edgeIndex.targetId);

  if (sourceIndex == null || targetIndex == null) {
    console.warn(`edgeIndexToEdgeModel: point not found: ${edgeIndex.sourceId} or ${edgeIndex.targetId}`);
    return null;
  }

  // Нормализуем порядок source/target по индексу для консистентности id ребра
  if (sourceIndex > targetIndex) {
    [edgeIndex.sourceId, edgeIndex.targetId] = [edgeIndex.targetId, edgeIndex.sourceId];
  }

  const source = pointCollection.getById(edgeIndex.sourceId);
  const target = pointCollection.getById(edgeIndex.targetId);

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

export function edgeIndexesToEdgeModels(
  edgeIndexes: EdgeRefs,
  pointCollection: EntityCollection<PointModel>,
  options: EdgeModelOptions = {},
): EdgeModel[] {
  const result: EdgeModel[] = [];
  for (const idx of edgeIndexes) {
    const model = edgeIndexToEdgeModel(idx, pointCollection, options);
    if (model) result.push(model);
  }
  return result;
}
