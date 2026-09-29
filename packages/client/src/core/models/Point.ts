import { BasePointMath } from "@core/models/BasePointMath";
import { PointMath } from "@core/models/PointMath";

export class Point extends PointMath {
  constructor(
    point: BasePointMath,
    public id: string,
    public text: string,
    public dragged: boolean = false,
    public selected: boolean = false,
    public pinned: boolean = false,
  ) {
    super(point.x, point.y, point.z);
    dragged ??= false;
    selected ??= false;
    pinned ??= false;
  }

  get fixed(): boolean {
    return this.dragged || this.selected || this.pinned;
  }

  clone(): Point {
    return new Point(this, this.id, this.text, this.dragged, this.selected, this.pinned);
  }
}
