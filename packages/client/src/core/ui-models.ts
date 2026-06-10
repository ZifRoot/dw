// core/ui-models.ts
export interface UIPoint {
  id: string;
  x: number;
  y: number;
  text: string;
  fixed: boolean;
}

export interface UIEdge {
  id: string;
  sourceId: string;
  targetId: string;
  distance?: number;
  visible: boolean;
}