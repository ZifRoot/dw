import { toDate } from "@utils/date-utils";
import { EmbeddingCreate } from "./EmbeddingCreate";

export class Embedding {
  public id?: never; // нет отдельного id, PK составной
  public sessionId: string;
  public model_name: string;
  public createdAt: Date;
  public dimension: number;
  public processing_time_ms: number;
  public embedding: number[] | null;

  constructor(data: EmbeddingCreate) {
    this.sessionId = data.sessionId;
    this.model_name = data.model_name;
    this.createdAt = data.createdAt ? toDate(data.createdAt)! : new Date();
    this.dimension = data.dimension;
    this.processing_time_ms = data.processing_time_ms;
    this.embedding = [];
    if (Array.isArray(data.embedding)) {
      this.embedding = data.embedding.map((a) => +a);
    }
  }
}
