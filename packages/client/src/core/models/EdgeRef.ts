import { LevenshteinEdit } from "@utils/levenshtein-edits";

export interface EdgeRef {
  sourceId: string;
  targetId: string;
  modelName?: string;
  distance?: number;
  levenshteinDistance?: number;
  levenshteinEdits?: LevenshteinEdit[];
}
