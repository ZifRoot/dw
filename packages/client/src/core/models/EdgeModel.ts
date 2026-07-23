// core/models/EdgeModel.ts
import { Edge } from "./Edge";
import { EdgeRef } from "./EdgeRef";
import { PointModel } from "./PointModel";

export class EdgeModel implements Edge, EdgeRef {
  public sourceId: string;
  public targetId: string;

  public cosineDistance: number;
  public intersectionCount: number;
  public intersectionSet?: Set<number>;

  public color: string;

  constructor(
    public source: PointModel,
    public target: PointModel,
    public distance: number = 100,
    cosineDistance: number,
    intersectionCount: number,

    color: string = "#888888",
    intersectionSet?: Set<number>,
  ) {
    this.cosineDistance = cosineDistance;
    this.intersectionCount = intersectionCount;
    this.intersectionSet = intersectionSet;

    this.color = color;
    this.sourceId = source.id;
    this.targetId = target.id;
  }
}
