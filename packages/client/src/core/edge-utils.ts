// core/utils/edge-utils.ts
import { PatternMatcher } from "./PatternMatcher";
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

  if (sourceIndex > targetIndex) {
    const [targetId, sourceId] = [edgeIndex.sourceId, edgeIndex.targetId];
    edgeIndex.sourceId = sourceId;
    edgeIndex.targetId = targetId;
  }

  const source = pointCollection.getById(edgeIndex.sourceId);
  const target = pointCollection.getById(edgeIndex.targetId);
  if (!source || !target) {
    console.warn(`edgeIndexToEdgeModel: point not found: ${edgeIndex.sourceId} or ${edgeIndex.targetId}`);
    return null;
  }

  // Определяем модель для сравнения (первая общая)
  let modelName = options.modelName;
  if (!modelName) {
    let source_embs = [...source.embeddings.keys()];
    let target_embs = [...target.embeddings.keys()];
    const models = source_embs.intersection(target_embs);
    modelName = models[0];
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

  return new EdgeModel(source, target, 100, modelName);
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

function cosineDistance(v1: number[], v2: number[]): number {
  if (!v1 || !v2 || v1.length === 0 || v2.length === 0) return 1;
  let dot = 0,
    norm1 = 0,
    norm2 = 0;
  for (let i = 0; i < v1.length; i++) {
    dot += v1[i] * v2[i];
    norm1 += v1[i] * v1[i];
    norm2 += v2[i] * v2[i];
  }
  if (norm1 === 0 || norm2 === 0) return 1;
  return 1 - dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
}
