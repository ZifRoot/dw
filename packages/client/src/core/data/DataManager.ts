// DataManager.ts (исправленный)
import { Configuration, DocumentsApi, EmbeddingsApi } from "src/clients/dew/fetch";
import { Point } from "../Point";
import { CanvasPositions, EmbeddingTable } from "./CanvasPositions";
import { toDate } from "@utils/date-utils";

export class DataManager {
  public _db: CanvasPositions;
  private embeddingsStore = new Map<string, EmbeddingTable[]>();
  documentsApi: DocumentsApi;
  embeddingsApi: EmbeddingsApi;

  get db() {
    return this._db;
  }

  constructor() {
    const config = new Configuration({
      basePath: "http://localhost:3000/api",
    });
    this.documentsApi = new DocumentsApi(config);
    this.embeddingsApi = new EmbeddingsApi(config);
    this._db = new CanvasPositions();
  }

  public getEmbeddingsStore(): Map<string, EmbeddingTable[]> {
    return this.embeddingsStore;
  }

  public clear(): void {
    this.embeddingsStore.clear();
  }

  public async loadPositionsAsync(points: Point[]): Promise<boolean> {
    const saved = await this.db.points.getAll();
    if (saved.length === 0) return false;
    for (const item of saved) {
      const point = points.find((p) => p.id === item.id);
      if (point) {
        point.x = item.x;
        point.y = item.y;
      }
    }
    return true;
  }

  public async savePositionsAsync(points: Point[]): Promise<void> {
    const data = points.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      title: p.text,
      updated_at: p.updated_at,
    }));
    await this.db.points.putMany(data);
  }

  public async fetchDocuments(): Promise<Point[]> {
    try {
      let docs = await this.documentsApi.documentsGet();
      return docs.map((session) => new Point(session.id, session.title, 300, 300, "right", session.updatedAt));
    } catch (err) {
      console.error("fetchDocuments error", err);
      return [];
    }
  }

  public async loadEmbeddings(points: Point[]): Promise<void> {
    await Promise.all(points.map((p) => this.fetchEmbeddingForPoint(p)));
  }

  private async fetchEmbeddingForPoint(point: Point): Promise<void> {
    try {
      let embs = await this.embeddingsApi.embeddingsSessionIdGet({ id: point.id });
      const embeddingTables: EmbeddingTable[] = embs.map((e) => ({
        session_id: point.id,
        model_name: e.modelName || "unknown",
        value: e.embedding || [],
        created_at: Date.now(),
      }));
      this.embeddingsStore.set(point.id, embeddingTables);
      await this.db.embeddings.putMany(embeddingTables);
    } catch (err) {
      console.error(`fetchEmbeddingForPoint ${point.id} error`, err);
    }
  }

  // --- НОВЫЙ МЕТОД СИНХРОНИЗАЦИИ ---
  /**
   * Синхронизирует локальную базу данных с сервером:
   * - Получает список всех документов с сервера.
   * - Сравнивает с существующими точками в IndexedDB по id и updated_at.
   * - Обновляет/добавляет только изменившиеся точки (сохраняя их координаты, если они уже были).
   * - Параллельно загружает эмбеддинги для изменившихся документов.
   * - Возвращает массив актуальных точек (с координатами из БД, которые могли быть изменены пользователем).
   */
  public async syncAll(): Promise<Point[]> {
    try {
      // 1. Загружаем свежий список документов с сервера
      const serverDocs = await this.documentsApi.documentsGet();

      // 2. Получаем все локальные точки (с сохранёнными координатами)
      const localPoints = await this.db.points.getAll();
      const localPointsMap = new Map<string, (typeof localPoints)[0]>();
      for (const lp of localPoints) {
        localPointsMap.set(lp.id, lp);
      }

      // 3. Определяем, какие точки нужно добавить или обновить
      const pointsToUpsert: typeof localPoints = [];
      const idsToFetchEmbeddings: string[] = [];

      for (const doc of serverDocs) {
        const local = localPointsMap.get(doc.id);
        const serverUpdatedAt = (toDate(doc.updatedAt) ?? new Date()).getTime();
        const loaclUpdatedAt = toDate(local?.updated_at)?.getTime();
        const needUpdate = loaclUpdatedAt !== serverUpdatedAt;

        if (needUpdate) {
          pointsToUpsert.push({
            id: doc.id,
            x: local?.x ?? 300, // сохраняем существующие координаты, иначе 300
            y: local?.y ?? 300,
            title: doc.title,
            updated_at: serverUpdatedAt,
          });
          idsToFetchEmbeddings.push(doc.id);
        }
      }

      // 4. Сохраняем обновлённые/новые точки в БД (одним запросом)
      if (pointsToUpsert.length > 0) {
        await this.db.points.putMany(pointsToUpsert);
      }

      // 5. Загружаем эмбеддинги для изменившихся документов ПАРАЛЛЕЛЬНО (не ждём)
      //    При этом используем существующий метод fetchEmbeddingForPoint,
      //    который через putMany заменит старые эмбеддинги (благодаря составному ключу).
      if (idsToFetchEmbeddings.length > 0) {
        // Создаём временные объекты Point, чтобы воспользоваться fetchEmbeddingForPoint
        const tempPoints = idsToFetchEmbeddings.map((id) => new Point(id, "", 0, 0, "right", new Date()));
        await Promise.all(tempPoints.map((p) => this.fetchEmbeddingForPoint(p)));
      }

      // 6. Загружаем все точки из БД (уже с актуальными координатами) и возвращаем
      const allPointsFromDb = await this.db.points.getAll();
      const resultPoints = allPointsFromDb.map((p) => new Point(p.id, p.title, p.x, p.y, "right", new Date(p.updated_at)));

      return resultPoints;
    } catch (err) {
      console.error("syncAll error", err);
      // При ошибке возвращаем то, что есть в локальной БД
      const fallback = await this.db.points.getAll();
      return fallback.map((p) => new Point(p.id, p.title, p.x, p.y, "right", new Date(p.updated_at)));
    }
  }
}
