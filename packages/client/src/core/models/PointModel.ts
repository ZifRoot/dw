import { EmbeddingModel } from "./EmbeddingModel";
import { Point } from "./Point";
import { PointMath } from "./PointMath";

export type TModelName = string;

export class PointModel extends Point {
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

  get fixed() {
    return this.dragged || this.selected || this.pinned;
  }

  clone(): PointModel {
    return new PointModel(this, this.id, this.text, this.dragged, this.selected, this.pinned);
  }
  embeddings: Map<TModelName, EmbeddingModel> = new Map();
}
