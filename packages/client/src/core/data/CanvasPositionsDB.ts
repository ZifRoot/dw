// app-db.ts
import { Database, ITable } from "./db-core";
import { EmbeddingTable } from "./tables/EmbeddingTable";
import { PointTable } from "./tables/PointTable";

export class CanvasPositionsDB extends Database {
  public points: ITable<PointTable>;
  public embeddings: ITable<EmbeddingTable>;

  constructor() {
    super("CanvasPositions", 3);

    this.points = this.addTable<PointTable>({
      name: "points",
      keyPath: "id",
      indexes: [
        { name: "by_updated", keyPath: "updated_at" },
        { name: "by_title", keyPath: "title" },
      ],
    });
    this.embeddings = this.addTable<EmbeddingTable>({
      name: "embeddings",
      keyPath: ["session_id", "model_name"],
      indexes: [
        { name: "by_session", keyPath: "session_id" },
        { name: "by_model", keyPath: "model_name" },
      ],
    });
  }
}
