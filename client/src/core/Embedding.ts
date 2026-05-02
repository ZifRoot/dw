/// <summary>Эмбеддинг точки от конкретной модели.</summary>

export interface Embedding {
  sessionId: string;
  model_name: string;
  createdAt: Date;
  dimension: number;
  processing_time_ms: number;
  embedding: number[] | null;
}
