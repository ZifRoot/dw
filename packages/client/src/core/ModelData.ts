import { cosineDistance } from "@utils/vector";
import { Pair } from "./Pair";
import { Point } from "./Point";
import { PointModel } from "./PointModel";

export enum ModelStage {
  Raw = "raw",
  Cosine = "cosine",
  Scaling = "scaling",
  Done = "done",
}

export class ModelData {
  public modelName: string;
  public weight = 1;
  public pointModels: PointModel[] = [];
  public pairs: Pair[] = [];
  public maxCosine = 1;

  private stage = ModelStage.Raw;
  lastMaxPx: number;
  maxTimeMs: number;
  start: number;

  constructor(modelName: string) {
    this.modelName = modelName;
    this.lastMaxPx = -Infinity;
    this.maxTimeMs = 100;
    this.start = 0;
  }

  /// <summary>Добавляет точку с вектором в модель.</summary>
  public addPointRef(point: Point, vector: number[]): void {
    this.pointModels.push(new PointModel(this.modelName, point, vector));
  }

  /// <summary>Проверяет, завершена ли обработка модели.</summary>
  public isDone(): boolean {
    return this.stage === ModelStage.Done;
  }

  public computeAllCosines(): void {
    this.maxCosine = Number.NEGATIVE_INFINITY;
    const n = this.pointModels.length;
    let rawPairs: { i: number; j: number }[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        rawPairs.push({ i, j });
      }
    }
    for (const { i, j } of rawPairs) {
      const cos = cosineDistance(this.pointModels[i].vector, this.pointModels[j].vector);
      const p1 = this.pointModels[i];
      const p2 = this.pointModels[j];
      this.pairs.push(new Pair(p1, p2, this.modelName, cos, 0));
      if (cos > this.maxCosine) this.maxCosine = cos;
    }
    this.stage = ModelStage.Scaling;
  }

  public scaleAllTargets(maxPx: number, threshold = 0.01): boolean {
    const diff = Math.abs(maxPx - this.lastMaxPx);
    if (diff <= threshold * maxPx) return false;
    this.forceScaleTargets(maxPx);
    return true;
  }

  public forceScaleTargets(maxPx: number): void {
    for (const pair of this.pairs) {
      pair.targetDistancePx = (pair.cosineDist / this.maxCosine) * maxPx;
    }
    this.lastMaxPx = maxPx;
  }

  /// <summary>Генератор для пошагового вычисления косинусов и масштабирования.</summary>
  public *processInSteps(maxPx: number): Generator<{ progress: number; done: boolean }, void, unknown> {
    // this.buildRawPairs(); // строим сырые пары прямо здесь
    for (let i = 0; i < this.pointModels.length; i++) {
      const A = this.pointModels[i];

      let pair = this.pointModels.map((B) => new Pair(A, B, this.modelName, cosineDistance(A.vector, B.vector), 0));
      pair.sort((a, b) => a.cosineDist - b.cosineDist);

      this.pairs.push(...pair.slice(1, 3));
      if (this.view()) {
        yield { progress: i / this.pointModels.length, done: false };
      }
    }

    // Масштабирование – быстрая операция, выполняем сразу
    this.scaleAllTargets(maxPx);
    yield { progress: 1, done: true };
  }

  view(): boolean {
    let now = performance.now();
    if (now - this.maxTimeMs > this.start) {
      this.start = now;
      return true;
    }
    return false;
  }
}
