// core/ui-models.ts
export interface UIPoint {
  id: string;
  x: number;
  y: number;
  z: number;
  text: string;
  pinned: boolean;
  selected: boolean;
}

export interface UIEdge {
  id: string;
  sourceId: string;
  targetId: string;
  distance?: number;
  visible: boolean;
}
