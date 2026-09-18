// core/models/EdgeModel.ts
import { Edge } from "./Edge";
import { EdgeRef } from "./EdgeRef";
import { PointModel } from "./PointModel";
import { cosineDistance as CosineDistance } from "@utils/vector";

export class EdgeModel extends Edge implements EdgeRef {
  public modelName: string;
  public cosineDistance: number;

  static getId(sourceId: string, targetId: string, modelName: string): string {
    const [a, b] = [sourceId, targetId].sort();
    return `${a}:${b}:${modelName}`;
  }

  constructor(
    source: PointModel,
    target: PointModel,
    modelName: string,
    cosineDistance?: number,
    distance: number = 100,
    color: string = "#231fe6",
  ) {
    super(source, target, distance, color);

    this.modelName = modelName;
    this.id = EdgeModel.getId(source.id, target.id, modelName);

    const sourceEmbedding = source.embeddings.get(modelName);
    const targetEmbedding = target.embeddings.get(modelName);

    if (!sourceEmbedding || !targetEmbedding) {
      this.color = "#ff0000";
      this.cosineDistance = 1;
      this.distance = 1000;
      return;
    }

    this.cosineDistance =
      cosineDistance ??
      CosineDistance(sourceEmbedding.value, targetEmbedding.value);
  }
}
