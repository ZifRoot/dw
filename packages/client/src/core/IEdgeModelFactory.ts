// core/interfaces/IEdgeModelFactory.ts

import { EdgeModel } from "./models/EdgeModel";
import { EdgeRef } from "./models/EdgeRef";

export interface IEdgeModelFactory {
  create(edgeRef: EdgeRef): EdgeModel | null;
}
