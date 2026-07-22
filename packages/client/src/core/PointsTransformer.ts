// PointsTransformer.ts
import { AppMediator } from "./AppMediator";
import { DataManager } from "./data/DataManager";
import { PointTable } from "./data/tables/PointTable";
import { EmbeddingTable } from "./data/tables/EmbeddingTable";

import { PointModel } from "./models/PointModel";
import { PointsScene } from "./Scene/PointsScene";
import { EmbeddingModel } from "./models/EmbeddingModel";

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
    });

    // 2. Подписка на табличные эмбеддинги
    this.unsubEmbeddingsTable = this.mediator.onEmbeddingsTable((embeddingsTable: EmbeddingTable[]) => {
      let points = this.pointsScene.getPoints();
      points = this.convertEmbeddingsTableToModel(points, embeddingsTable);
      this.pointsScene.setPoints(points);
    });

    // 3. Подписка на редкое массовое обновление точек (по окончании физики)
    this.unsubPointsUpdated = this.mediator.onPointsUpdated(async (points: PointModel[]) => {
      await this.savePoints(points);
    });

    // 4. Подписка на точечное обновление (одна точка изменилась)
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

  // ========== Конвертация: таблица → модель ==========
  private convertPointsTableToModel(pointsTable: PointTable[]): PointModel[] {
    return pointsTable.map((pt) => new PointModel({ x: pt.x!, y: pt.y!, z: pt.z! }, pt.id, pt.title));
  }

  private convertEmbeddingsTableToModel(points: PointModel[], embeddingsTable: EmbeddingTable[]): PointModel[] {
    let fff = new Map(points.map((p) => [p.id, p]));

    for (const emb of embeddingsTable) {
      let doc = fff.get(emb.session_id);
      if (!doc) continue;
      if (!doc.embeddings.has(emb.model_name)) {
        doc.embeddings.set(emb.model_name, new EmbeddingModel(emb.session_id, emb.model_name, emb.value, emb.created_at, emb.processingTimeMs));
      }
    }
    return points;
  }

  // ========== Конвертация: модель → таблица и сохранение ==========
  private async savePoints(points: PointModel[]): Promise<void> {
    const pointTables: PointTable[] = points.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      title: p.text,
      updated_at: Date.now(),
    }));
    await this.dataManager.savePointsTable(pointTables);
  }
}
