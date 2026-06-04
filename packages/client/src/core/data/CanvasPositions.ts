// app-db.ts
import { Database, ITable, TableConfig } from "./db-core";

export interface PointTable {
  id: string;
  x: number;
  y: number;
  title: string;
  updated_at: number;
}

export interface EmbeddingTable {
  session_id: string;
  model_name: string;
  value: number[];
  created_at: number;
}

export class CanvasPositions extends Database {
  public points: ITable<PointTable>;
  public embeddings: ITable<EmbeddingTable>;

  constructor() {
    super("CanvasPositions", 2);

    const pointsConfig: TableConfig = {
      name: "points",
      keyPath: "id",
      indexes: [
        { name: "by_updated", keyPath: "updated_at" },
        { name: "by_title", keyPath: "title" },
      ],
    };

    const embeddingsConfig: TableConfig = {
      name: "embeddings",
      keyPath: ["session_id", "model_name"],
      indexes: [
        { name: "by_session", keyPath: "session_id" },
        { name: "by_model", keyPath: "model_name" },
      ],
    };

    this.points = this.createTable<PointTable>(pointsConfig);
    this.embeddings = this.createTable<EmbeddingTable>(embeddingsConfig);
  }
}
