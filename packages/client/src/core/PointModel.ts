import { Point } from "./Point";

/// <summary>Обёртка точки + вектор для конкретной модели.</summary>
export class PointModel {
  constructor(
    public modelName: string,
    public point: Point,
    public vector: number[],
  ) {}
}
