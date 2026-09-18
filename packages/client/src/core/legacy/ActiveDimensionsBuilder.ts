// core/ActiveDimensionsBuilder.ts
import { PointModel } from "../models/PointModel";
import { EmbeddingModel } from "../models/EmbeddingModel";

export class ActiveDimensionsBuilder {
  private threshold: number | null = null;
  private targetActiveFraction: number = 0.2; // целевая доля активных размерностей

  constructor(threshold?: number, targetActiveFraction?: number) {
    if (threshold !== undefined) this.threshold = threshold;
    if (targetActiveFraction !== undefined) this.targetActiveFraction = targetActiveFraction;
  }

  /** Вычислить порог на основе всех эмбеддингов */
  public computeThreshold(points: PointModel[]): number {
    if (this.threshold !== null) return this.threshold;

    const allValues: number[] = [];
    for (const point of points) {
      for (const emb of point.embeddings.values()) {
        for (const val of emb.value) {
          allValues.push(Math.abs(val));
        }
      }
    }
    if (allValues.length === 0) return 0.5;
    allValues.sort((a, b) => a - b);
    const index = Math.floor(allValues.length * (1 - this.targetActiveFraction));
    const threshold = allValues[index] || 0.5;
    console.log(`[ActiveDimensionsBuilder] Computed threshold = ${threshold.toFixed(4)}`);
    return threshold;
  }

  /** Создать EmbeddingModel с активными индексами для указанной точки и модели */
  public buildForPoint(point: PointModel, modelName: string, threshold: number): EmbeddingModel | null {
    const emb = point.embeddings.get(modelName);
    if (!emb) return null;
    return new EmbeddingModel(emb.docid, emb.modelName, emb.value, emb.created_at, emb.processingTimeMs);
  }
}
