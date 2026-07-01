import { Point } from "./Point";
import { PointMath } from "./PointMath";

export class PointModel extends Point {
  constructor(
    public id: string,
    public text: string,
    public fixed: boolean = false,
    point: PointMath,
  ) {
    super(point.x, point.y, point.z);
  }

  clone(): PointModel {
    return new PointModel(this.id, this.text, this.fixed, this);
  }
}
