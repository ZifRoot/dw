// app-db.ts
import { ITable } from "@core/data/IndexDb/ITable";
import { Database } from "@core/data/IndexDb/Database";
import { EmbeddingTable } from "./tables/EmbeddingTable";
import { PointTable } from "./tables/PointTable";
import { EdgeTable } from "./tables/EdgeTable";

type GUID = string;
type TPointID = GUID;

type TSessionId = GUID;
type TModel = string;

type TEmbeddingId = [TSessionId, TModel];

export class PointDB extends Database {
  public points: ITable<PointTable, TPointID>;
  public embeddings: ITable<EmbeddingTable, TEmbeddingId>;
  public edges: ITable<EdgeTable, string>;

  constructor() {
    super("CanvasPositions", 4);

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
    this.edges = this.addTable<EdgeTable, string>({
      name: "edges",
      keyPath: "id",
      indexes: [
        { name: "by_source", keyPath: "source_id" },
        { name: "by_target", keyPath: "target_id" },
      ],
    });
  }
}
