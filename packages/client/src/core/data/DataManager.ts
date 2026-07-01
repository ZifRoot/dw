// DataManager.ts

import { CanvasPositionsDB } from "./CanvasPositionsDB";
import { AppMediator } from "../AppMediator";
import { PointTable } from "./tables/PointTable";
import { EmbeddingTable } from "./tables/EmbeddingTable";
import { LogSafe, Safe } from "@utils/logger";
import { toDate } from "@utils/date-utils";
import { SingleExecution } from "@utils/single-runner";
import * as fetch from "src/clients/dew/fetch";

export class DataManager {
  private db: CanvasPositionsDB;
  private documentsApi: fetch.DocumentsApi;
  private embeddingsApi: fetch.EmbeddingsApi;
  private unsubReload: () => void;

  constructor(private mediator: AppMediator) {
    const config = new fetch.Configuration({ basePath: "http://localhost:3000/api" });
    this.documentsApi = new fetch.DocumentsApi(config);
    this.embeddingsApi = new fetch.EmbeddingsApi(config);
    this.db = new CanvasPositionsDB();
    // Подписка на команду перезагрузки таблиц
    this.unsubReload = this.mediator.onReloadTables(() => this.reloadTables());
  }

  public destroy(): void {
    this.unsubReload();
  }

  // ========== Загрузка локальных данных ==========
  private async loadLocalDataAndEmit(): Promise<void> {
    const points = await this.db.points.getAll();
    const embeddings = await this.db.embeddings.getAll();

    this.mediator.pointsTable = points;
    this.mediator.embeddingsTable = embeddings;
  }
  reloadTables() {
    this.reloadTablesSingle().catch(() => {});
  }

  // ========== Полная синхронизация с сервером ==========
  @SingleExecution
  @LogSafe
  private async reloadTablesSingle(): Promise<void> {
    await this.loadLocalDataAndEmit();
    // 1. Загружаем документы с сервера
    const serverDocs = await this.documentsApi.documentsGet();

    // 2. Загружаем эмбеддинги для всех документов
    const serverEmbeddings = await this.fetchAllEmbeddings(serverDocs);

    // 3. Синхронизируем таблицы
    await this.syncPointsWithServer(serverDocs);
    await this.syncEmbeddingsWithServer(serverEmbeddings);

    // 4. Отправляем обновлённые локальные данные
    await this.loadLocalDataAndEmit();
  }

  private async fetchAllEmbeddings(documents: fetch.DocumentsGet200ResponseInner[]): Promise<fetch.EmbeddingsSessionIdGet200ResponseInner[]> {
    const promises = documents.map((doc) => this.embeddingsSessionIdGet(doc));
    const results = await Promise.all(promises);
    return results.filter((a) => a != null).flat();
  }

  @Safe
  private embeddingsSessionIdGet(doc: fetch.DocumentsGet200ResponseInner): Promise<fetch.EmbeddingsSessionIdGet200ResponseInner[] | null> {
    return this.embeddingsApi.embeddingsSessionIdGet({ id: doc.id });
  }

  private async syncPointsWithServer(serverDocs: fetch.DocumentsGet200ResponseInner[]): Promise<void> {
    const localPoints = await this.db.points.getAll();
    const localMap = new Map(localPoints.map((p) => [p.id, p]));

    for (const doc of serverDocs) {
      const existing = localMap.get(doc.id);
      const serverUpdatedAt = toDate(doc.updatedAt)?.getTime() ?? Date.now();
      if (!existing || existing.updated_at !== serverUpdatedAt) {
        const pointTable: PointTable = {
          id: doc.id,
          x: existing?.x, // начальные координаты, если нет локальных
          y: existing?.y,
          title: doc.title,
          updated_at: serverUpdatedAt,
        };
        await this.db.points.put(pointTable);
      }
    }
  }

  private async syncEmbeddingsWithServer(serverEmbeddings: any[]): Promise<void> {
    // Упрощённая синхронизация: заменяем все эмбеддинги для документа
    for (const emb of serverEmbeddings) {
      const embeddingTable: EmbeddingTable = {
        session_id: emb.sessionId,
        model_name: emb.modelName || "unknown",
        value: emb.embedding || [],
        created_at: Date.now(),
      };
      await this.db.embeddings.put(embeddingTable);
    }
  }

  // ========== Сохранение изменений (вызывается из PointsTransformer) ==========
  public async savePointsTable(points: PointTable[]): Promise<void> {
    await this.db.points.putMany(points);
  }

  public async saveEmbeddingsTable(embeddings: EmbeddingTable[]): Promise<void> {
    await this.db.embeddings.putMany(embeddings);
  }
}
