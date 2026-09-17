// core/models/EdgeModel.ts
import { hashX1 } from "@utils/data-utils";
import { Edge } from "./Edge";
import { EdgeRef } from "./EdgeRef";
import { PointModel } from "./PointModel";
import { cosineDistance as CosineDistance } from "@utils/vector";
import { th } from "zod/v4/locales/index.js";

export class EdgeModel implements Edge, EdgeRef {
  public sourceId: string;
  public targetId: string;
  public id: string;
  public cosineDistance: number;
  public distance: number;

  /**
   * Generate a unique ID for an edge based on source, target, and model name.
   * Ensures that edges between the same nodes but with different models are distinct.
   */
  static getId(sourceId: string, targetId: string, modelName: string): string {
    const [a, b] = [sourceId, targetId].sort();
    return hashX1(`${a}:${b}:${modelName}`);
  }

  constructor(
    public source: PointModel,
    public target: PointModel,
    public modelName: string,
    cosineDistance?: number,
    distance: number = 100,
    public color: string = "#231fe6",
  ) {
    this.id = EdgeModel.getId(source.id, target.id, modelName);
    this.sourceId = source.id;
    this.targetId = target.id;

    const s_e = source.embeddings.get(modelName);
    const t_e = target.embeddings.get(modelName);

    if (!s_e || !t_e) {
      color = "#ff0000";
      this.cosineDistance = 1;
      this.distance = 1000;
      return;
    }
    this.cosineDistance = cosineDistance ?? CosineDistance(s_e.value, t_e.value);
    this.distance = distance;
  }
}
