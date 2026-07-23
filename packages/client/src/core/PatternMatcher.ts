// core/PatternMatcher.ts
import { EmbeddingModel } from "./models/EmbeddingModel";
import { PatternColorPalette } from "./PatternColorPalette";

export class PatternMatcher {
  private palette: PatternColorPalette;

  constructor(palette?: PatternColorPalette) {
    this.palette = palette ?? new PatternColorPalette();
  }

  /** Количество общих активных индексов (со знаком) */
  public patternScore(a: EmbeddingModel, b: EmbeddingModel): number {
    return a.intersectionCount(b);
  }

  /** Цвет для пары на основе пересечения */
  public colorForPair(a: EmbeddingModel, b: EmbeddingModel): string {
    const intersection = a.intersect(b);
    return this.palette.getColor(intersection);
  }
}
