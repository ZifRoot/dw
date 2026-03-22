export type EmbeddingCreate = {
  id?: string;
  model_name: string;
  embedding: unknown; // не сохраняем, но для совместимости оставляем
  dimension: number;
  processing_time_ms: number;
  sessionId: string;
  createdAt?: Date | number | null;
};
