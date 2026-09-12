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
    this.activeIndices = EmbeddingModel.getActiveIndices(value, activationThreshold);
  }

  static getActiveIndices(value: number[], activationThreshold: number): Set<number> {
    const activeIndices = new Set<number>();
    for (let i = 0; i < value.length; i++) {
      const abs = Math.abs(value[i]);
      if (abs > activationThreshold) {
        const idx = i + 1; // смещение, чтобы 0 не было
        const signedIdx = value[i] > 0 ? idx : -idx;
        activeIndices.add(signedIdx);
      }
    }
    return activeIndices;
  }

  get activeIndicesCount(): number {
    return this.activeIndices.size;
  }

  /** Пересечение с другим эмбеддингом – проверяем совпадение модели */
  getIntersectionIndices(other: EmbeddingModel): Set<number> {
    if (this.modelName !== other.modelName) {
      return new Set();
    }
    return this.activeIndices.intersection(other.activeIndices);
  }

  /** Количество общих активных размерностей */
  intersectionCount(other: EmbeddingModel): number {
    return this.getIntersectionIndices(other).size;
  }
}
