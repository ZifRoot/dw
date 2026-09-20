// core/models/PointModel.ts
import { BasePointMath } from "@core/models/BasePointMath";
import { EmbeddingModel } from "./EmbeddingModel";
import { Point } from "@core/models/Point";

export class PointModel extends Point {
  public embeddings: Map<string, EmbeddingModel> = new Map();

  constructor(point: BasePointMath, id: string, text: string, dragged: boolean = false, selected: boolean = false, pinned: boolean = false) {
    super(point, id, text, dragged, selected, pinned);
  }

  clone(): PointModel {
    return new PointModel(this, this.id, this.text, this.dragged, this.selected, this.pinned);
  }
}
