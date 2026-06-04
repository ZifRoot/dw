export type EmbeddingCreate = {
  sessionId: string;
  model_name: string;
  createdAt?: Date | number | null;
  processing_time_ms: number;
  embedding?: unknown;
  dimension?: number;
};
