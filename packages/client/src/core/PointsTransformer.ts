// core/PointsTransformer.ts
import { AppMediator } from "./AppMediator";
import { DataManager } from "./data/DataManager";
import { PointTable } from "./data/tables/PointTable";
import { EmbeddingTable } from "./data/tables/EmbeddingTable";
import { EdgeTable } from "./data/tables/EdgeTable";
import { PointModel } from "./models/PointModel";
import { EmbeddingModel } from "./models/EmbeddingModel";
import { EdgeRefs } from "./models/EdgeRefs";
import { PointGraphManager } from "./PointGraphManager";

export class PointsTransformer {
  private unsubPointsUpdated: () => void;
  private unsubPointUpdated: () => void;
  private unsubSavePositions: () => void;

  constructor(
    private mediator: AppMediator,
    private dataManager: DataManager,
    private pointGraphManager: PointGraphManager,
  ) {
    this.dataManager.setPointsTransformer(this);

    // Сигнал обновления точек не содержит массив: актуальные данные находятся
    // в PointGraphManager.
    this.unsubPointsUpdated = this.mediator.onPointsUpdated(async () => {
      await this.savePoints(this.pointGraphManager.getPoints());
    });

    // Передаём только ID изменённой точки; сам объект берём из графа.
    this.unsubPointUpdated = this.mediator.onPointUpdated(async ({ pointId }) => {
      const point = this.pointGraphManager.getPointCollection().getById(pointId);
      if (point) {
        await this.savePoints([point]);
      }
    });

    this.unsubSavePositions = this.mediator.onSavePositions(async () => {
      await this.saveScene();
    });
  }

  public destroy(): void {
    this.unsubPointsUpdated();
    this.unsubPointUpdated();
    this.unsubSavePositions();
  }

  /** Получение таблиц из DataManager напрямую. */
  public setTables(points: PointTable[], embeddings: EmbeddingTable[], edges: EdgeTable[]): void {
    const modelPoints = this.convertPointsTableToModel(points);
    this.mergeEmbeddingsIntoPoints(modelPoints, embeddings);
    const edgeRefs = this.convertEdgesToRefs(edges);
    this.updatePointGraphManager(modelPoints, edgeRefs);
  }

  /** Обновить PointGraphManager и уведомить подписчиков через медиатор. */
  private updatePointGraphManager(points: PointModel[], edges: EdgeRefs): void {
    this.pointGraphManager.update(points,edges);
    this.pointGraphManager.initFromRefs(edges);

    // Через медиатор передаётся только сигнал, без крупных массивов.
    
  }

  private convertPointsTableToModel(pointsTable: PointTable[]): PointModel[] {
    return pointsTable.map((pt) => {
      const math = { x: pt.x ?? 0, y: pt.y ?? 0, z: pt.z ?? 0 };
      return new PointModel(math, pt.id, pt.title);
    });
  }

  private convertEdgesToRefs(edges: EdgeTable[]): EdgeRefs {
    return edges.map((e) => ({
      sourceId: e.source_id,
      targetId: e.target_id,
      modelName: e.model_name,
      distance: e.distance,
    }));
  }

  private mergeEmbeddingsIntoPoints(points: PointModel[], embeddingsTable: EmbeddingTable[]): void {
    const pointMap = new Map(points.map((p) => [p.id, p]));
    for (const emb of embeddingsTable) {
      const doc = pointMap.get(emb.session_id);
      if (!doc) continue;
      if (!doc.embeddings.has(emb.model_name)) {
        const model = new EmbeddingModel(emb.session_id, emb.model_name, emb.value, emb.created_at, emb.processingTimeMs ?? 0, 0.5);
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

  private async saveEdges(edges: EdgeRefs): Promise<void> {
    const edgeTables: EdgeTable[] = edges.map((e) => ({
      id: `${e.sourceId}-${e.targetId}`,
      source_id: e.sourceId,
      target_id: e.targetId,
      model_name: e.modelName,
      distance: e.distance,
      updated_at: Date.now(),
    }));
    await this.dataManager.saveEdgesTable(edgeTables);
  }

  /** Сохранить текущую сцену: позиции точек + связи из PointGraphManager. */
  private async saveScene(): Promise<void> {
    try {
      const points = this.pointGraphManager.getPoints();
      const edges = this.pointGraphManager.getAllEdgeRefs();

      await this.savePoints(points);
      await this.saveEdges(edges);
      this.mediator.positionsSaved();
    } catch (e) {
      console.error("Не удалось сохранить позиции точек и связи:", e);
    }
  }
}
