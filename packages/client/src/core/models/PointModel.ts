// core/models/PointModel.ts
import { Point } from "./Point";
import { PointMath } from "./PointMath";
import { EmbeddingModel } from "./EmbeddingModel";

export class PointModel extends Point {
  public embeddings: Map<string, EmbeddingModel> = new Map();

  constructor(
    point: PointMath,
    public id: string,
    public text: string,
    public dragged: boolean = false,
    public selected: boolean = false,
    public pinned: boolean = false,
  ) {
    super(point.x, point.y, point.z);
  }

  get fixed(): boolean {
    return this.dragged || this.selected || this.pinned;
  }

  clone(): PointModel {
    return new PointModel(this, this.id, this.text, this.dragged, this.selected, this.pinned);
  }
}
