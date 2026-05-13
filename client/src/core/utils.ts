import { accurateSum } from "../utils/data-utils";

/// <summary>Вычисляет косинусное расстояние между двумя векторами.</summary>
export function cosineDistance(vecA: number[], vecB: number[]): number {
  let c = vecA.map((a, i) => a - vecB[i]);
  for (let i = 0; i < c.length; i++) {
    c[i] *= c[i];
  }
  return accurateSum(c);
  const dot = accurateSum(vecA.map((v, i) => v * vecB[i]));
  const magA = accurateSum(vecA.map((v) => v * v));
  const magB = accurateSum(vecB.map((v) => v * v));
  const mag = Math.sqrt(magA) * Math.sqrt(magB);
  return mag === 0 ? 1 : 1 - dot / mag;
}
