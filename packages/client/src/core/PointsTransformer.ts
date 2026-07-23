// core/PointsTransformer.ts
import { AppMediator } from "./AppMediator";
import { DataManager } from "./data/DataManager";
import { PointTable } from "./data/tables/PointTable";
import { EmbeddingTable } from "./data/tables/EmbeddingTable";
import { PointModel } from "./models/PointModel";
import { EmbeddingModel } from "./models/EmbeddingModel";
import { PointsScene } from "./Scene/PointsScene";

export class PointsTransformer {
  private unsubPointsTable: () => void;
  private unsubEmbeddingsTable: () => void;
  private unsubPointsUpdated: () => void;
  private unsubPointUpdated: () => void;

  constructor(
    private mediator: AppMediator,
    private dataManager: DataManager,
    private pointsScene: PointsScene,
  ) {
    // 1. Подписка на табличные точки
    this.unsubPointsTable = this.mediator.onPointsTable((pointsTable: PointTable[]) => {
      const modelPoints = this.convertPointsTableToModel(pointsTable);
      this.pointsScene.setPoints(modelPoints);
      this.mediator.pointsModelReady(modelPoints);
    });

    // 2. Подписка на табличные эмбеддинги
    this.unsubEmbeddingsTable = this.mediator.onEmbeddingsTable((embeddingsTable: EmbeddingTable[]) => {
      let points = this.pointsScene.getPoints();
      this.mergeEmbeddingsIntoPoints(points, embeddingsTable);
      this.pointsScene.setPoints(points);
      this.mediator.pointsModelReady(points);
    });

    // 3. Подписка на редкое массовое обновление точек
    this.unsubPointsUpdated = this.mediator.onPointsUpdated(async (points: PointModel[]) => {
      await this.savePoints(points);
    });

    // 4. Подписка на точечное обновление
    this.unsubPointUpdated = this.mediator.onPointUpdated(async (point: PointModel) => {
      await this.savePoints([point]);
    });
  }

  public destroy(): void {
    this.unsubPointsTable();
    this.unsubEmbeddingsTable();
    this.unsubPointsUpdated();
    this.unsubPointUpdated();
  }

  private convertPointsTableToModel(pointsTable: PointTable[]): PointModel[] {
    return pointsTable.map((pt) => {
      const math = { x: pt.x ?? 0, y: pt.y ?? 0, z: pt.z ?? 0 };
      return new PointModel(math, pt.id, pt.title);
    });
  }

  private mergeEmbeddingsIntoPoints(points: PointModel[], embeddingsTable: EmbeddingTable[]): void {
    const pointMap = new Map(points.map((p) => [p.id, p]));
    for (const emb of embeddingsTable) {
      const doc = pointMap.get(emb.session_id);
      if (!doc) continue;
      if (!doc.embeddings.has(emb.model_name)) {
        // Создаём EmbeddingModel с временным порогом 0.5 (будет пересчитан позже)
        // В реальности порог будет вычислен в ModelManager, но нам нужно сохранить данные
        const model = new EmbeddingModel(
          emb.session_id,
          emb.model_name,
          emb.value,
          emb.created_at,
          emb.processingTimeMs ?? 0,
          0.5, // временно, будет пересчитано
        );
        doc.embeddings.set(emb.model_name, model);
      }
    }
  }

  private async savePoints(points: PointModel[]): Promise<void> {
    const pointTables: PointTable[] = points.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      z: p.z,
      title: p.text,
      updated_at: Date.now(),
    }));
    await this.dataManager.savePointsTable(pointTables);
  }
}
