import { Point } from "../Point";
import { ChatSession } from "../ChatSession";
import { Embedding } from "../Embedding";
import { PointPosition, PointPositionDB } from "../PointPositionDB";

/**
 * Загрузка/сохранение документов, эмбеддингов, позиций.
 * Обработка ошибок минимальна (только консоль), без UI.
 */
export class DataManager {
  public positionDB: PointPositionDB | null = null;
  private embeddingsStore = new Map<string, Embedding[]>();

  public getEmbeddingsStore(): Map<string, Embedding[]> {
    return this.embeddingsStore;
  }

  public clear(): void {
    this.embeddingsStore.clear();
  }

  public async loadPositionsAsync(points: Point[]): Promise<boolean> {
    if (!this.positionDB) return false;
    const saved = await this.positionDB.loadAll();
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
    if (!this.positionDB) return;
    const data = points.map((p) => ({ id: p.id, x: p.x, y: p.y }) as PointPosition);
    await this.positionDB.saveAll(data);
  }

  public async fetchDocuments(): Promise<Point[]> {
    try {
      const response = await fetch(`/api/documents`);
      if (!response.ok) return [];
      const data = (await response.json()) as ChatSession[];
      return data.map((session) => new Point(session.id, session.title, 300, 300, "right"));
    } catch (err) {
      console.error("fetchDocuments error", err);
      return [];
    }
  }

  public async loadEmbeddings(points: Point[]): Promise<void> {
    this.embeddingsStore.clear();
    await Promise.all(points.map((p) => this.fetchEmbeddingForPoint(p)));
  }

  private async fetchEmbeddingForPoint(point: Point): Promise<void> {
    try {
      const resp = await fetch(`/api/embeddings/${point.id}`);
      if (!resp.ok) return;
      const data = (await resp.json()) as Embedding[];
      this.embeddingsStore.set(point.id, data);
    } catch (err) {
      console.error(`fetchEmbeddingForPoint ${point.id} error`, err);
    }
  }
}
