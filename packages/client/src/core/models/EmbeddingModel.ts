// core/models/EmbeddingModel.ts
export class EmbeddingModel {
  public activeIndices: Set<number> = new Set(); // знаковые индексы: положительные -> +i, отрицательные -> -i

  constructor(
    public docid: string,
    public modelName: string,
    public value: number[],
    public created_at: number,
    public processingTimeMs: number,
    activationThreshold: number = 0.5,
  ) {
    for (let i = 0; i < value.length; i++) {
      const abs = Math.abs(value[i]);
      if (abs > activationThreshold) {
        const idx = i + 1; // смещение, чтобы 0 не было
        const signedIdx = value[i] > 0 ? idx : -idx;
        this.activeIndices.add(signedIdx);
      }
    }
  }

  get activeCount(): number {
    return this.activeIndices.size;
  }

  /** Пересечение с другим эмбеддингом – проверяем совпадение модели */
  intersect(other: EmbeddingModel): Set<number> {
    if (this.modelName !== other.modelName) {
      return new Set();
    }
    const result = new Set<number>();
    for (const idx of this.activeIndices) {
      if (other.activeIndices.has(idx)) {
        result.add(idx);
      }
    }
    return result;
  }

  /** Количество общих активных размерностей */
  intersectionCount(other: EmbeddingModel): number {
    return this.intersect(other).size;
  }
}
