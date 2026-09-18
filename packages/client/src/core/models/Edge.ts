import { hashX1 } from "@utils/data-utils";
import { Point } from "./Point";

export class Edge {
  public sourceId: string;
  public targetId: string;
  public id: string;

  constructor(
    public source: Point,
    public target: Point,
    public distance: number = 100,
    public color: string = "#231fe6",
  ) {
    this.sourceId = source.id;
    this.targetId = target.id;
    this.id = Edge.getId(source.id, target.id);
  }

  static getId(sourceId: string, targetId: string): string {
    const [a, b] = [sourceId, targetId].sort();
    return hashX1(`${a}:${b}`);
  }
}