import { LevenshteinEdit } from "@utils/levenshtein-edits";
import { Edge } from "./Edge";
import { EdgeRef } from "./EdgeRef";
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

  static fromRef(source: Point, target: Point, edgeRef: EdgeRef): LevenshteinEdgeModel {
    return new LevenshteinEdgeModel(
      source,
      target,
      edgeRef.levenshteinDistance ?? 0,
      edgeRef.levenshteinEdits ?? [],
    );
  }
}
