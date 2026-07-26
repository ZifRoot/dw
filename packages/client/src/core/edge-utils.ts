// core/utils/edge-utils.ts
import { PatternMatcher } from "./PatternMatcher";
import { EntityCollection } from "./Scene/indexer";
import { EdgeModel } from "./models/EdgeModel";
import { EdgeRef } from "./models/EdgeRef";
import { EdgeRefs } from "./models/EdgeRefs";
import { PointModel } from "./models/PointModel";

export interface EdgeModelOptions {
  modelName?: string;
  weight?: number;
  color?: string;
  cosineDistance?: number;
  intersectionCount?: number;
  intersectionSet?: Set<number>;
}

export function edgeIndexToEdgeModel(
  edgeIndex: EdgeRef,
  pointCollection: EntityCollection<PointModel>,
  matcher: PatternMatcher,
  options: EdgeModelOptions = {},
): EdgeModel | null {
  const source = pointCollection.getById(edgeIndex.sourceId);
  const target = pointCollection.getById(edgeIndex.targetId);
  if (!source || !target) {
    console.warn(`edgeIndexToEdgeModel: point not found: ${edgeIndex.sourceId} or ${edgeIndex.targetId}`);
    return null;
  }

  // Определяем модель для сравнения (первая общая)
  let modelName = options.modelName;
  if (!modelName) {
    for (const [name] of source.embeddings) {
      if (target.embeddings.has(name)) {
        modelName = name;
        break;
      }
    }
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

  const cosineDist = options.cosineDistance ?? cosineDistance(embSource.value, embTarget.value);
  const intersection = embSource.intersect(embTarget);
  const interCount = options.intersectionCount ?? intersection.size;
  const color = options.color ?? matcher.colorForPair(embSource, embTarget);
  const weight = options.weight ?? 100;

  return new EdgeModel(source, target, cosineDist, interCount, weight, color, options.intersectionSet ?? (interCount > 0 ? intersection : undefined));
}

export function edgeIndexesToEdgeModels(
  edgeIndexes: EdgeRefs,
  pointCollection: EntityCollection<PointModel>,
  matcher: PatternMatcher,
  options: EdgeModelOptions = {},
): EdgeModel[] {
  const result: EdgeModel[] = [];
  for (const idx of edgeIndexes) {
    const model = edgeIndexToEdgeModel(idx, pointCollection, matcher, options);
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
