import { Point } from "./Point";
import { ModelData } from "./ModelData";
import { Pair } from "./Pair";
import { AppMediator } from "./AppMediator";
import { Embedding } from "../Embedding";

/**
 * Управляет моделями, покрытием, генерацией пар.
 * Реализует "двойной толкач" для ускорения генерации пар
 * через анимационный цикл и setInterval/delay.
 */
export class ModelManager {
  private models: ModelData[] = [];
  private modelsMap = new Map<string, ModelData>();
  private pairs: Pair[] = [];
  private coverage = new Map<string, number>();
  private topModelNames: string[] = [];
  private allModelsGen: Generator<{ progress: number; done: boolean }, void, unknown> | null = null;
  private generatorInterval: number | null = null;
  private processingCompleted = false;

  constructor(private mediator: AppMediator) {}

  public async updateModelStats(points: Point[], embeddingsStore: Map<string, Embedding[]>): Promise<void> {
    this.coverage = this.computeCoverage(embeddingsStore);
    this.topModelNames = ["sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"]; // берём вторую модель – магия
    this.initModels(this.topModelNames);

    for (const point of points) {
      const embList = embeddingsStore.get(point.id);
      if (!embList) continue;
      for (const emb of embList) {
        const model = this.modelsMap.get(emb.model_name);
        if (model && emb.embedding) {
          model.addPointRef(point, emb.embedding);
        }
      }
    }

    // Запускаем генератор пар (генератор, который будет выдавать пары порциями)
    this.allModelsGen = this.processAllModels(this.models, 50000, 8);
    this.processingCompleted = false;
  }

  private computeCoverage(embeddingsStore: Map<string, Embedding[]>): Map<string, number> {
    const coverage = new Map<string, number>();
    for (const [, embList] of embeddingsStore) {
      for (const emb of embList) {
        const cnt = coverage.get(emb.model_name) ?? 0;
        coverage.set(emb.model_name, cnt + 1);
      }
    }
    return coverage;
  }

  private selectTopModels(topN: number): string[] {
    const entries = Array.from(this.coverage.entries());
    entries.sort((a, b) => b[1] - a[1]);
    return entries.slice(0, topN).map(([name]) => name);
  }

  private initModels(modelNames: string[]): void {
    this.models = modelNames.map((name) => {
      const model = new ModelData(name);
      this.modelsMap.set(name, model);
      return model;
    });
  }

  private *processAllModels(models: ModelData[], maxPx: number, maxTimeMs: number): Generator<{ progress: number; done: boolean }, void, unknown> {
    let totalPairs = 0;
    for (const m of models) {
      const n = m.pointModels.length;
      totalPairs += (n * (n - 1)) / 2;
    }
    let processedPairs_l = 0;
    for (const model of models) {
      const gen = model.processInSteps(maxPx);
      const modelTotalPairs = (model.pointModels.length * (model.pointModels.length - 1)) / 2;
      let result;
      do {
        result = gen.next();
        if (!result.done) {
          const modelProgress = result.value.progress;
          const modelProcessed = modelProgress * modelTotalPairs;
          const processedPairs = processedPairs_l + modelProcessed;
          const overall = processedPairs / totalPairs;
          yield { progress: overall, done: false };
        }
      } while (!result.done);
      processedPairs_l += modelTotalPairs;
    }
    this.pairs = models.flatMap((m) => m.pairs);
    yield { progress: 0.9, done: false };
    this.pairs.sort((a, b) => a.cosineDist - b.cosineDist);
    yield { progress: 1, done: true };
  }

  // Вызывается из анимационного цикла – один шаг
  public stepAllModels(): boolean {
    if (!this.allModelsGen || this.processingCompleted) return false;
    const result = this.allModelsGen.next();
    if (!result.done) {
      this.mediator.progress = result.value.progress;
      return true;
    } else {
      this.processingCompleted = true;
      if (this.generatorInterval) {
        clearInterval(this.generatorInterval);
        this.generatorInterval = null;
      }
      return false;
    }
  }

  // Запуск "двойного толкача": анимационный цикл + setInterval для ускорения
  public startDoublePush(): void {
    if (this.generatorInterval) return;
    this.generatorInterval = window.setInterval(() => {
      if (this.allModelsGen && !this.processingCompleted) {
        this.stepAllModels();
      } else if (this.processingCompleted && this.generatorInterval) {
        clearInterval(this.generatorInterval);
        this.generatorInterval = null;
      }
    }, 10); // каждые 10 мс
  }

  public getPairs(): Pair[] {
    return this.pairs;
  }

  public hasPairs(): boolean {
    return this.pairs.length > 0;
  }

  public clear(): void {
    this.models = [];
    this.modelsMap.clear();
    this.pairs = [];
    this.coverage.clear();
    this.topModelNames = [];
    this.allModelsGen = null;
    this.processingCompleted = false;
    if (this.generatorInterval) {
      clearInterval(this.generatorInterval);
      this.generatorInterval = null;
    }
  }
}
