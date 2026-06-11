// app-db.ts
import { Database, ITable, TableConfig } from "./db-core";
import { EmbeddingTable } from "./tables/EmbeddingTable";
import { PointTable } from "./tables/PointTable";

export class CanvasPositionsDB extends Database {
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
