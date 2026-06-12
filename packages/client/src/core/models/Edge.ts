import { Point } from "./Point";

export interface Edge {
  id: string; // уникальный идентификатор ребра (например, "sourceId-targetId")
  sourceId: string;
  targetId: string;
  source: Point;
  target: Point;
  distance?: number; // опционально
}
