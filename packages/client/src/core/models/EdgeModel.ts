// core/models/EdgeModel.ts
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

  constructor(
    public source: PointModel,
    public target: PointModel,
    public distance: number = 100,
    public modelName: string,

    public color: string = "#888888",
  ) {
    this.id = `${source.id}-${target.id}`;
    this.sourceId = source.id;
    this.targetId = target.id;

    const s_e = source.embeddings.get(modelName);
    const t_e = target.embeddings.get(modelName);
    if (s_e != null && t_e != null) {
      this.intersectionSet = s_e.intersect(t_e);
    }
  }
}
