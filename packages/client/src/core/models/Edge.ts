import { Point } from "./Point";
import { PointModel } from "./PointModel";

export interface Edge {
  source: PointModel;
  target: PointModel;
}

export interface EdgeModel extends Edge {
  id: string; // уникальный идентификатор ребра (например, "sourceId-targetId")
  sourceId: string;
  targetId: string;
  source: PointModel;
  target: PointModel;
  distance?: number; // опционально
}
