// core/models/EdgeModel.ts
import { hashX1 } from "@utils/data-utils";
import { Edge } from "./Edge";
import { EdgeRef } from "./EdgeRef";
import { PointModel } from "./PointModel";

export class EdgeModel implements Edge, EdgeRef {
  public sourceId: string;
  public targetId: string;
  public id: string;

  public intersectionSet: Set<number> = new Set();
  public get intersectionCount() {
    return this.intersectionSet.size ?? 0;
  }

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
    public distance: number = 100,
    public modelName: string,

    public color: string = "#888888",
  ) {
    this.id = EdgeModel.getId(source.id, target.id, modelName);
    this.sourceId = source.id;
    this.targetId = target.id;

    const s_e = source.embeddings.get(modelName);
    const t_e = target.embeddings.get(modelName);
    if (s_e != null && t_e != null) {
      this.intersectionSet = s_e.getIntersectionIndices(t_e);
    }
  }
}
