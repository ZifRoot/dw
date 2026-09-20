import { Point } from "@core/models/Point";
import { BasePointMath } from "@core/models/BasePointMath";
let nextId = 1000;
export class DocumentPoint extends Point {
  constructor(point: BasePointMath, public largeText: string) {
    super(point, `p${nextId++}`, largeText.substring(0,20));
  }
}