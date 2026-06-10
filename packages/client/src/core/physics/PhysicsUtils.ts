import { Point } from "../models/Point";

export function computeDisplacement(
  p1: Point,
  p2: Point,
  targetDist: number,
  strength: number,
): { newP1: { x: number; y: number }; newP2: { x: number; y: number } } {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const curDist = Math.hypot(dx, dy);
  if (curDist < 1e-5) {
    return { newP1: { x: p1.x, y: p1.y }, newP2: { x: p2.x, y: p2.y } };
  }
  const diff = Math.max(curDist - targetDist, 0);
  const force = diff * strength;
  const moveX = (dx / curDist) * force;
  const moveY = (dy / curDist) * force;
  return {
    newP1: { x: p1.x - moveX, y: p1.y - moveY },
    newP2: { x: p2.x + moveX, y: p2.y + moveY },
  };
}

export function smoothMove(point: Point, target: { x: number; y: number }, smoothingFactor: number): void {
  point.x = point.x * (1 - smoothingFactor) + target.x * smoothingFactor;
  point.y = point.y * (1 - smoothingFactor) + target.y * smoothingFactor;
}

export function mxy(dist: number, dx: number, dy: number, force: number, epsilon: number, minDistance: number): { moveX: number; moveY: number } {
  if (dist < epsilon) {
    const angle = Math.random() * 2 * Math.PI;
    const r = minDistance;
    return { moveX: Math.cos(angle) * r, moveY: Math.sin(angle) * r };
  }
  return { moveX: (dx / dist) * force, moveY: (dy / dist) * force };
}
