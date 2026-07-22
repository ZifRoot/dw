export class EmbeddingModel {
  constructor(
    public docid: string,
    public modelName: string,
    public value: number[],
    public created_at: number,
    public processingTimeMs: number,
  ) {}
}
