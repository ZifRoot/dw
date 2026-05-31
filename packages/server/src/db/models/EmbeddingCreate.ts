export type EmbeddingCreate = {
  sessionId: string;
  model_name: string;
  createdAt?: Date | number | null;
  embedding: unknown; // не сохраняем, но для совместимости оставляем
  dimension: number;
  processing_time_ms: number;
};
