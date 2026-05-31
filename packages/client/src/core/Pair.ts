import { PointModel } from "./PointModel";

/// <summary>Пара точек с информацией о модели и расстояниях.</summary>
export class Pair {
  constructor(
    public p1: PointModel,
    public p2: PointModel,
    public modelName: string,
    public cosineDist: number,
    public targetDistancePx: number
  ) { }
}
