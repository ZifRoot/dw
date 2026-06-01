const DB_NAME = "CanvasPositions";
const STORE_NAME = "points";

export interface EMB {
  model: string;
  value: number[];
}

export interface PointPosition {
  id: string;
  x: number;
  y: number;
  title: string;
  updated_at: number;
  embs: EMB[];
}

export class PointPositionDB {
  private db: IDBDatabase;

  // Приватный конструктор, чтобы создавать экземпляры только через статический init
  private constructor(db: IDBDatabase) {
    this.db = db;
  }

  /** Статический метод инициализации – открывает БД и возвращает готовый экземпляр */
  static async init(): Promise<PointPositionDB> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        resolve(new PointPositionDB(db));
      };
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
    });
  }

  /** Сохраняет все переданные точки (полная перезапись хранилища) */
  async saveAll(points: PointPosition[]): Promise<void> {
    const tx = this.db!.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    // Очищаем и записываем всё одной транзакцией
    // store.clear();
    for (const p of points) {
      store.put(p); // put обновит или вставит
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /** Частичное обновление блока точек (только указанные ID) */
  async upsertBatch(updates: PointPosition[]): Promise<void> {
    const tx = this.db!.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const p of updates) {
      store.put(p);
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /** Загружает все сохранённые позиции */
  async loadAll(): Promise<PointPosition[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /** Проверяет, есть ли сохранённые данные */
  async hasData(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.count();
      request.onsuccess = () => resolve(request.result > 0);
      request.onerror = () => reject(request.error);
    });
  }

  /** Очищает хранилище */
  async clear(): Promise<void> {
    const tx = this.db!.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
