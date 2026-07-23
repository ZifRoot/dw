// PatternMatcher.ts
import { EmbeddingModel } from "./models/EmbeddingModel";
import { PatternColorPalette } from "./PatternColorPalette";

export class PatternMatcher {
  private palette: PatternColorPalette;

  constructor(palette?: PatternColorPalette) {
    this.palette = palette ?? new PatternColorPalette();
  }

  patternScore(a: EmbeddingModel, b: EmbeddingModel): number {
    return a.intersectionCount(b);
  }

  colorForPair(a: EmbeddingModel, b: EmbeddingModel): string {
    const intersection = a.intersect(b);
    if (intersection.size === 0) return "#888888";
    return this.palette.getColor(intersection);
  }
}