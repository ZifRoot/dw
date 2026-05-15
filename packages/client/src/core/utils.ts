import { accurateSum } from "../utils/data-utils";

/// <summary>Вычисляет косинусное расстояние между двумя векторами.</summary>
export function cosineDistance(vecA: number[], vecB: number[]): number {
  let c = vecA.map((a, i) => a - vecB[i]);
  for (let i = 0; i < c.length; i++) {
    c[i] *= c[i];
  }
  return accurateSum(c);
}
