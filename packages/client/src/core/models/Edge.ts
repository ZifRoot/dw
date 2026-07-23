import { PointModel } from "./PointModel";

export interface Edge {
  source: PointModel;
  target: PointModel;
}

export interface EdgeRef {
  sourceId: string;
  targetId: string;
  distance: number;
}

export type EdgeRefs = EdgeRef[];

export interface EdgeModel extends Edge, EdgeRef {
  id: string; // уникальный идентификатор ребра (например, "sourceId-targetId")
  sourceId: string;
  targetId: string;
  source: PointModel;
  target: PointModel;
  distance: number; // опционально
}
