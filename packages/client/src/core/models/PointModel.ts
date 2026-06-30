import { Point, PointMath } from "./Point";

export class PointModel extends Point {
  constructor(
    public id: string,
    public text: string,
    public fixed: boolean = false,
    point: PointMath,
  ) {
    super();
    this.set(point);
  }

  clone(): PointModel {
    return new PointModel(this.id, this.text, this.fixed, this);
  }
}
