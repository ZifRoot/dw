import { levenshteinEdits, LevenshteinEdit } from "@utils/levenshtein-edits";
import { Edge } from "./Edge";
import { Point } from "./Point";

export class LevenshteinEdgeModel extends Edge {
  public levenshteinDistance: number;
  public levenshteinEdits: LevenshteinEdit[];

  constructor(
    source: Point,
    target: Point,
    levenshteinDistance: number,
    levenshteinEdits: LevenshteinEdit[],
  ) {
    super(source, target, 100);
    this.levenshteinDistance = levenshteinDistance;
    this.levenshteinEdits = levenshteinEdits;
  }

  static fromPoints(source: Point, target: Point): LevenshteinEdgeModel {
    const sourceText = (source as { largeText?: string }).largeText;
    const targetText = (target as { largeText?: string }).largeText;

    if (sourceText === undefined || targetText === undefined) {
      throw new Error("LevenshteinEdgeModel requires points with largeText.");
    }

    const edits = levenshteinEdits(sourceText, targetText);

    return new LevenshteinEdgeModel(source, target, edits.length, edits);
  }
}
