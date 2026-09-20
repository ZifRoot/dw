export interface UIPointNeighbor {
  id: string;
  name: string;
  distance?: number;
  cosineDistance?: number;
}

export interface UIPointBase {
  id: string;
  x: number;
  y: number;
  z: number;
  text: string;
  pinned: boolean;
  selected: boolean;
  neighbors: UIPointNeighbor[];
}

export interface UIEmbeddingPoint extends UIPointBase {
  kind: "embedding";
  embeddingModelNames: string[];
}

export interface UIDocumentPoint extends UIPointBase {
  kind: "document";
  largeText: string;
}

export type UISelectedPoint = UIEmbeddingPoint | UIDocumentPoint;
