import { Pair } from "../Pair";
import { computeDisplacement, smoothMove } from "./PhysicsUtils";

/**
 * Отвечает за притяжение точек на основе пар (эмбеддинг).
 */
export class EmbeddingEngine {
  public applyDisplacement(pair: Pair, forceStrength: number, smoothingFactor: number): void {
    const targetDist = pair.targetDistancePx * 3; // коэффициент 3 – исторически
    const { newP1, newP2 } = computeDisplacement(pair.p1.point, pair.p2.point, targetDist, forceStrength);
    smoothMove(pair.p1.point, newP1, smoothingFactor);
    smoothMove(pair.p2.point, newP2, smoothingFactor);
  }
}
