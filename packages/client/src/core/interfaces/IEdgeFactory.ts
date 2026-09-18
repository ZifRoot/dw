import { Edge } from "../models/Edge";
import { EdgeRef } from "../models/EdgeRef";

export interface IEdgeFactory {
  create(edgeRef: EdgeRef): Edge | null;
}
