import { CanvasPositionsDB } from "./CanvasPositionsDB";
import { AppMediator } from "../AppMediator";
import { PointTable } from "./tables/PointTable";
import { EmbeddingTable } from "./tables/EmbeddingTable";
import { EdgeTable } from "./tables/EdgeTable";
import { LogSafe, Safe } from "@utils/logger";
import { toDate } from "@utils/date-utils";
import { SingleExecution } from "@utils/single-runner";
import * as fetch from "@clients/dew/fetch";

export class DataManager {
  private db: CanvasPositionsDB;
  private documentsApi: fetch.DocumentsApi;
  private embeddingsApi: fetch.EmbeddingsApi;
  private unsubReload: () => void;

  lowDate = new Date(2000, 1, 1, 1, 1, 1, 1);

  constructor(private mediator: AppMediator) {
    const config = new fetch.Configuration({ basePath: "/api" });
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
    const embeddings: EmbeddingTable[] = await this.db.embeddings.getAll();

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
    await this.syncPointsWithServer(serverDocs);

    let embeddings = await this.embeddingsApi.embeddingsQueryGet({ updateat: this.lowDate });
    await this.syncEmbeddingsWithServer(embeddings);

    // 2. Загружаем эмбеддинги для всех документов
    //const serverEmbeddings = await this.fetchAllEmbeddings(serverDocs);

    // 3. Синхронизируем таблицы

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
          z: existing?.z,
          title: doc.title,
          updated_at: serverUpdatedAt,
        };
        await this.db.points.put(pointTable);
      }
    }

    const points = await this.db.points.getAll();

    this.mediator.pointsTable = points;
  }

  private async syncEmbeddingsWithServer(serverEmbeddings: fetch.EmbeddingsSessionIdGet200ResponseInner[]): Promise<void> {
    let sessions = new Set<string>();
    for (const emb of serverEmbeddings) {
      const sessionId = emb.sessionId;
      const modelName = emb.modelName;
      const local = await this.db.embeddings.get([sessionId, modelName]);

      const serverCreatedAt = toDate(emb.createdAt)?.getTime() ?? 0;
      const localValue = local?.value ?? [];
      const localCreatedAt = toDate(local?.created_at)?.getTime() ?? 0;

      if (localValue.length === 0 || serverCreatedAt > localCreatedAt) {
        sessions.add(sessionId);
      }
    }

    for (const session of sessions) {
      let embs = await this.embeddingsApi.embeddingsSessionIdGet({ id: session });

      for (const emb of embs) {
        const sessionId = emb.sessionId;
        const modelName = emb.modelName;
        const local = await this.db.embeddings.get([sessionId, modelName]);

        const serverCreatedAt = toDate(emb.createdAt)?.getTime() ?? 0;
        const serverEmbedding = emb.embedding ?? [];
        const localValue = local?.value ?? [];
        const localCreatedAt = toDate(local?.created_at)?.getTime() ?? 0;

        // Единое условие обновления:
        // 1. Нет локальной записи -> создаём
        // 2. Сервер прислал непустой массив -> обновляем, если локальный пустой ИЛИ дата сервера новее
        // 3. Сервер прислал пустой массив -> обновляем дату только если локальный тоже пустой И дата сервера новее
        const shouldUpdate =
          local === undefined ||
          (serverEmbedding.length > 0 && (localValue.length === 0 || serverCreatedAt > localCreatedAt)) ||
          (serverEmbedding.length === 0 && localValue.length === 0 && serverCreatedAt > localCreatedAt);

        if (shouldUpdate) {
          await this.db.embeddings.put({
            session_id: sessionId,
            model_name: modelName,
            value: serverEmbedding,
            created_at: serverCreatedAt,
            processingTimeMs: emb.processingTimeMs,
          });
        }
      }  
    }

    let embs = await this.db.embeddings.getAll();
  }

  // ========== Сохранение изменений (вызывается из PointsTransformer) ==========
  public async savePointsTable(points: PointTable[]): Promise<void> {
    await this.db.points.putMany(points);
  }

  public async saveEmbeddingsTable(embeddings: EmbeddingTable[]): Promise<void> {
    await this.db.embeddings.putMany(embeddings);
  }

  public async saveEdgesTable(edges: EdgeTable[]): Promise<void> {
    await this.db.edges.putMany(edges);
  }
}
