// core/ui-models.ts
export interface UIPointNeighbor {
  id: string;
  name: string;
  cosineDistance?: number;
}

export interface UIPoint {
  id: string;
  x: number;
  y: number;
  z: number;
  text: string;
  pinned: boolean;
  selected: boolean;
  neighbors?: UIPointNeighbor[];
  embeddingModelNames?: string[];
}

export interface UIEdge {
  id: string;
  sourceId: string;
  targetId: string;
  distance?: number;
  visible: boolean;
}
