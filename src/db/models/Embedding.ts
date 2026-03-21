import { toDate } from "../../utils/data-utils";
import { EmbeddingCreate } from "./EmbeddingCreate";

export class Embedding {
  public id: string;
  public sessionId: string;
  public model_name: string;
  public dimension: number;
  public processing_time_ms: number;
  public createdAt: Date;
  public embedding: number[];

  constructor(data: EmbeddingCreate) {
    this.id = data.id ?? crypto.randomUUID();
    this.sessionId = data.sessionId;
    this.model_name = data.model_name;
    this.dimension = data.dimension;
    this.processing_time_ms = data.processing_time_ms;
    this.createdAt = data.createdAt ? toDate(data.createdAt)! : new Date();
    this.embedding = [];
    if (Array.isArray(data.embedding)) {
      this.embedding = data.embedding.map((a) => +a);
    }
  }

  // toCreate(): EmbeddingCreate {
  //   return { ...this };
  // }
}
