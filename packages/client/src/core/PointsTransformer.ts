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
  private unsubPointsTable: () => void;
  private unsubEmbeddingsTable: () => void;
  private unsubPointsUpdated: () => void;
  private unsubPointUpdated: () => void;
  private unsubSavePositions: () => void;
  private cachedPoints: PointModel[] = [];

  constructor(
    private mediator: AppMediator,
    private dataManager: DataManager,
    private pointGraphManager: PointGraphManager,
  ) {
    // 1. Подписка на табличные точки
    this.unsubPointsTable = this.mediator.onPointsTable((pointsTable: PointTable[]) => {
      const modelPoints = this.convertPointsTableToModel(pointsTable);
      this.cachedPoints = modelPoints;
      this.updatePointGraphManager();
    });

    // 2. Подписка на табличные эмбеддинги
    this.unsubEmbeddingsTable = this.mediator.onEmbeddingsTable((embeddingsTable: EmbeddingTable[]) => {
      this.mergeEmbeddingsIntoPoints(this.cachedPoints, embeddingsTable);
      this.updatePointGraphManager();
    });

    // 3. Подписка на редкое массовое обновление точек
    this.unsubPointsUpdated = this.mediator.onPointsUpdated(async (points: PointModel[]) => {
      await this.savePoints(points);
    });

    // 4. Подписка на точечное обновление
    this.unsubPointUpdated = this.mediator.onPointUpdated(async (point: PointModel) => {
      await this.savePoints([point]);
    });

    // 5. Подписка на команду сохранения позиций точек и связей (кнопка в UI)
    this.unsubSavePositions = this.mediator.onSavePositions(async () => {
      await this.saveScene();
    });
  }

  public destroy(): void {
    this.unsubPointsTable();
    this.unsubEmbeddingsTable();
    this.unsubPointsUpdated();
    this.unsubPointUpdated();
    this.unsubSavePositions();
  }

  /** Обновить PointGraphManager и уведомить подписчиков через медиатор */
  private updatePointGraphManager(): void {
    // Передаём точки напрямую в PointGraphManager
    this.pointGraphManager.updatePoints(this.cachedPoints);
    
    // Инициализируем граф из сохранённых связей
    const edges = this.savedEdges();
    this.pointGraphManager.initFromRefs(edges);
    
    // Уведомляем через медиатор (без передачи массивов!) - только сигнал об обновлении
    this.mediator.pointsGraphUpdated();
  }

  private convertPointsTableToModel(pointsTable: PointTable[]): PointModel[] {
    return pointsTable.map((pt) => {
      const math = { x: pt.x ?? 0, y: pt.y ?? 0, z: pt.z ?? 0 };
      return new PointModel(math, pt.id, pt.title);
    });
  }

  /** Сохранённые связи из локальной БД в виде EdgeRefs */
  private savedEdges(): EdgeRefs {
    return this.mediator.edgesTable.map((e) => ({
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

  /** Сохранить текущую сцену: позиции точек + связи (из mediator.edges) */
  private async saveScene(): Promise<void> {
    try {
      await this.savePoints(this.cachedPoints);
      await this.saveEdges(this.mediator.edges);
      // Событие успеха – индикатор «Сохранено» в UI
      this.mediator.positionsSaved();
    } catch (e) {
      console.error("Не удалось сохранить позиции точек и связи:", e);
    }
  }
}
