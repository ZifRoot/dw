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
    // Регистрируем себя в DataManager для получения таблиц
    this.dataManager.setPointsTransformer(this);

    // Подписка на редкое массовое обновление точек
    this.unsubPointsUpdated = this.mediator.onPointsUpdated(async (points: PointModel[]) => {
      await this.savePoints(points);
    });

    // Подписка на точечное обновление
    this.unsubPointUpdated = this.mediator.onPointUpdated(async (point: PointModel) => {
      await this.savePoints([point]);
    });

    // Подписка на команду сохранения позиций точек и связей (кнопка в UI)
    this.unsubSavePositions = this.mediator.onSavePositions(async () => {
      await this.saveScene();
    });
  }

  public destroy(): void {
    this.unsubPointsUpdated();
    this.unsubPointUpdated();
    this.unsubSavePositions();
  }

  /** Получение таблиц из DataManager напрямую */
  public setTables(points: PointTable[], embeddings: EmbeddingTable[], edges: EdgeTable[]): void {
    const modelPoints = this.convertPointsTableToModel(points);
    this.mergeEmbeddingsIntoPoints(modelPoints, embeddings);
    this.updatePointGraphManager(modelPoints, edges);
  }

  /** Обновить PointGraphManager и уведомить подписчиков через медиатор */
  private updatePointGraphManager(points: PointModel[], edges: EdgeTable[]): void {
    // Передаём точки напрямую в PointGraphManager
    this.pointGraphManager.updatePoints(points);
    
    // Инициализируем граф из сохранённых связей
    const edgeRefs = this.convertEdgesToRefs(edges);
    this.pointGraphManager.initFromRefs(edgeRefs);
    
    // Уведомляем через медиатор (без передачи массивов!) - только сигнал об обновлении
    this.mediator.pointsGraphUpdated();
  }

  private convertPointsTableToModel(pointsTable: PointTable[]): PointModel[] {
    return pointsTable.map((pt) => {
      const math = { x: pt.x ?? 0, y: pt.y ?? 0, z: pt.z ?? 0 };
      return new PointModel(math, pt.id, pt.title);
    });
  }

  /** Преобразовать EdgeTable в EdgeRefs */
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
        // Создаём EmbeddingModel с временным порогом 0.5 (будет пересчитан позже)
        // В реальности порог будет вычислен в ModelManager, но нам нужно сохранить данные
        const model = new EmbeddingModel(
          emb.session_id,
          emb.model_name,
          emb.value,
          emb.created_at,
          emb.processingTimeMs ?? 0,
          0.5, // временно, будет пересчитан
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

  /** Сохранить текущую сцену: позиции точек + связи из PointGraphManager */
  private async saveScene(): Promise<void> {
    try {
      // Получаем актуальные точки и связи напрямую из PointGraphManager.
      // Медиатор больше не используется как хранилище крупного массива рёбер.
      const points = this.pointGraphManager.getPoints();
      const edges = this.pointGraphManager.getAllEdgeRefs();

      await this.savePoints(points);
      await this.saveEdges(edges);
      // Событие успеха – индикатор «Сохранено» в UI
      this.mediator.positionsSaved();
    } catch (e) {
      console.error("Не удалось сохранить позиции точек и связи:", e);
    }
  }
}
