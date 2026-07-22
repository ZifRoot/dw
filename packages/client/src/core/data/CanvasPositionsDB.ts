// app-db.ts
import { ITable } from "./IndexDb/ITable";
import { Database } from "./IndexDb/Database";
import { EmbeddingTable } from "./tables/EmbeddingTable";
import { PointTable } from "./tables/PointTable";

type GUID = string;
type TPointID = GUID;

type TSessionId = GUID;
type TModel = string;

type TEmbeddingId = [TSessionId, TModel];

export class CanvasPositionsDB extends Database {
  public points: ITable<PointTable, TPointID>;
  public embeddings: ITable<EmbeddingTable, TEmbeddingId>;

  constructor() {
    super("CanvasPositions", 3);

    this.points = this.addTable<PointTable, TPointID>({
      name: "points",
      keyPath: "id",
      indexes: [
        { name: "by_updated", keyPath: "updated_at" },
        { name: "by_title", keyPath: "title" },
      ],
    });
    this.embeddings = this.addTable<EmbeddingTable, TEmbeddingId>({
      name: "embeddings",
      keyPath: ["session_id", "model_name"],
      indexes: [
        { name: "by_session", keyPath: "session_id" },
        { name: "by_model", keyPath: "model_name" },
      ],
    });
  }
}
