import {
  Configuration,
  DocumentsApi,
  EmbeddingsApi,
  EmbeddingsIdGet200ResponseInner,
} from "src/clients/dew/fetch";
import { Point } from "../Point";
import { PointPosition, PointPositionDB } from "./PointPositionDB";

/**
 * Загрузка/сохранение документов, эмбеддингов, позиций.
 * Обработка ошибок минимальна (только консоль), без UI.
 */
export class DataManager {
  public _db: PointPositionDB | null = null;
  private embeddingsStore = new Map<string, Embedding[]>();
  documentsApi: DocumentsApi;
  embeddingsApi: EmbeddingsApi;

  get db() {
    return this._db;
  }

  constructor() {
    const config = new Configuration({
      basePath: "http://100.123.252.125:8081/",
    });

    this.documentsApi = new DocumentsApi(config);
    this.embeddingsApi = new EmbeddingsApi(config);
    PointPositionDB.init().then((p) => (this._db = p));
  }

  public getEmbeddingsStore(): Map<string, Embedding[]> {
    return this.embeddingsStore;
  }

  public clear(): void {
    this.embeddingsStore.clear();
  }

  public async loadPositionsAsync(points: Point[]): Promise<boolean> {
    if (!this._db) return false;
    const saved = await this._db.loadAll();
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
    if (!this._db) return;
    const data = points.map(
      (p) =>
        ({
          id: p.id,
          x: p.x,
          y: p.y,
          title: p.text,
          updated_at: p.updated_at,
        } as PointPosition)
    );
    await this._db.saveAll(data);
  }

  public async fetchDocuments(): Promise<Point[]> {
    try {
      let docs = await this.documentsApi.documentsGet();
      return docs.map(
        (session) =>
          new Point(
            session.id,
            session.title,
            300,
            300,
            "right",
            session.updatedAt
          )
      );
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
      let embs = await this.embeddingsApi.embeddingsIdGet({ id: point.id });
      const resp = await fetch(`/api/embeddings/${point.id}`);
      if (!resp.ok) return;
      const data = (await resp.json()) as EmbeddingsIdGet200ResponseInner[];
      this.embeddingsStore.set(point.id, data);
    } catch (err) {
      console.error(`fetchEmbeddingForPoint ${point.id} error`, err);
    }
  }
}
