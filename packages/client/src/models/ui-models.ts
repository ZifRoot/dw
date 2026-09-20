// UI DTOs. These types form the boundary between domain objects and React UI.

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
  largeText?: string;
  pinned: boolean;
  selected: boolean;
  neighbors?: UIPointNeighbor[];
  embeddingModelNames?: string[];
}

export type UIPointChange = Partial<
  Pick<UIPoint, "text" | "largeText" | "x" | "y" | "z" | "pinned" | "selected">
>;

export interface UIEdge {
  id: string;
  sourceId: string;
  targetId: string;
  distance?: number;
  visible: boolean;
}
