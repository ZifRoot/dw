import { Pair } from "./Pair";
import { Point } from "./Point";
import { PointModel } from "./PointModel";
import { cosineDistance } from "./utils";

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
  public maxCosine = 0;

  private stage = ModelStage.Raw;
  private rawPairs: { i: number; j: number }[] = [];
  lastMaxPx: number;

  constructor(modelName: string) {
    this.modelName = modelName;
    this.lastMaxPx = -Infinity;
  }

  /// <summary>Добавляет точку с вектором в модель.</summary>
  public addPointRef(point: Point, vector: number[]): void {
    this.pointModels.push(new PointModel(this.modelName, point, vector));
  }

  /// <summary>Проверяет, завершена ли обработка модели.</summary>
  public isDone(): boolean {
    return this.stage === ModelStage.Done;
  }

  /// <summary>Генерирует порцию сырых пар. Возвращает количество сгенерированных.</summary>
  public buildRawPairs(): void {
    const n = this.pointModels.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        this.rawPairs.push({ i, j });
      }
    }
    this.stage = ModelStage.Cosine;
  }

  public computeAllCosines(): void {
    this.maxCosine = Number.NEGATIVE_INFINITY;
    for (const { i, j } of this.rawPairs) {
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
  public *processInSteps(maxPx: number, maxTimeMs = 8): Generator<{ progress: number; done: boolean }, void, unknown> {
    this.buildRawPairs(); // строим сырые пары прямо здесь
    const total = this.rawPairs.length;
    let processed = 0;
    let start = performance.now();

    for (const { i, j } of this.rawPairs) {
      const cos = cosineDistance(this.pointModels[i].vector, this.pointModels[j].vector);
      const pair = new Pair(this.pointModels[i], this.pointModels[j], this.modelName, cos, 0);
      this.pairs.push(pair);
      if (cos > this.maxCosine) this.maxCosine = cos;
      processed++;

      if (processed % 1000 === 0 && performance.now() - start > maxTimeMs) {
        yield { progress: processed / total, done: false };
        start = performance.now();
      }
    }
    this.rawPairs = []; // освобождаем память
    // Масштабирование – быстрая операция, выполняем сразу
    this.scaleAllTargets(maxPx);
    yield { progress: 1, done: true };
  }
}
