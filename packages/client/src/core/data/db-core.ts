export interface TableConfig {
  name: string;
  keyPath: string | string[];
  autoIncrement?: boolean;
  indexes?: {
    name: string;
    keyPath: string;
    options?: IDBIndexParameters;
  }[];
}

export interface ITableInfo {
  readonly config: TableConfig;
  readonly name: string;
  readonly database: IDatabase;
}

export interface IDatabase {
  open(): Promise<IDBDatabase>;
  close(): Promise<void>;
  // transaction(storeNames: string | string[], mode: IDBTransactionMode): Promise<IDBTransaction>;
  put<T>(storeName: string, item: T): Promise<void>;
  putMany<T>(storeName: string, items: T[]): Promise<void>;
  get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined>;
  getAll<T>(storeName: string): Promise<T[]>;
  delete(storeName: string, key: IDBValidKey): Promise<void>;
  clear(storeName: string): Promise<void>;
  readonly tables: readonly ITableInfo[];
}

// Generic-интерфейс таблицы
export interface ITable<T> extends ITableInfo {
  put(item: T): Promise<void>;
  putMany(items: T[]): Promise<void>;
  get(key: IDBValidKey): Promise<T | undefined>;
  getAll(): Promise<T[]>;
  delete(key: IDBValidKey): Promise<void>;
  clear(): Promise<void>;
}

export abstract class Database implements IDatabase {
  private db: IDBDatabase | null = null;
  private dbName: string;
  private version: number;
  private registeredTables: ITableInfo[] = [];
  private promise_db?: Promise<IDBDatabase>;
  public verbose: boolean = false;

  constructor(dbName: string, version: number) {
    this.dbName = dbName;
    this.version = version;
  }

  get tables(): readonly ITableInfo[] {
    return this.registeredTables;
  }

  protected addTable<T>(config: TableConfig): ITable<T> {
    const table = new Table<T>(this, config);
    this.registeredTables.push(table);
    return table;
  }

  async open(): Promise<IDBDatabase> {
    return this.promise_db ?? (this.promise_db = this._open());
  }

  private _open() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (changeEvent) => this.onupgradeneeded(request, changeEvent);
    });
  }

  private onupgradeneeded(request: IDBOpenDBRequest, event: IDBVersionChangeEvent) {
    const db = request.result;
    const transaction = request.transaction;
    if (!transaction) {
      throw new Error("Transaction is null in upgradeneeded");
    }

    // 1. Существующие имена хранилищ
    const existingStoreNames = Array.from(db.objectStoreNames);

    // 2. Удаляем лишние хранилища (которых нет в конфиге)
    const requiredStoreNames = this.tables.map((s) => s.config.name);
    existingStoreNames.filter((s) => !requiredStoreNames.includes(s)).forEach((storeName) => this.deleteTable(db, storeName));

    // 3. Для каждого хранилища из конфига
    for (const table of this.tables) {
      let config = table.config;
      let store: IDBObjectStore = this.ensureTable(config, db, transaction);

      // Синхронизация индексов
      let indexes = config.indexes ?? [];
      const requiredIndexNames = indexes.map((idx) => idx.name);
      const existingIndexNames = Array.from(store.indexNames);

      // Удаляем лишние индексы
      existingIndexNames.filter((s) => !requiredIndexNames.includes(s)).forEach((idxName) => this.deleteIndex(store, idxName, config));

      // Добавляем недостающие индексы
      indexes.filter((s) => !store.indexNames.contains(s.name)).forEach((idxConfig) => this.createIndex(store, idxConfig, config));
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private deleteTable(db: IDBDatabase, storeName: string) {
    db.deleteObjectStore(storeName);
    if (this.verbose) console.log(`Удалено лишнее хранилище: ${storeName}`);
  }

  private deleteIndex(store: IDBObjectStore, idxName: string, config: TableConfig) {
    store.deleteIndex(idxName);
    if (this.verbose) console.log(`[${config.name}] Удалён индекс: ${idxName}`);
  }

  private createIndex(store: IDBObjectStore, idxConfig: { name: string; keyPath: string; options?: IDBIndexParameters }, config: TableConfig) {
    store.createIndex(idxConfig.name, idxConfig.keyPath, idxConfig.options);
    if (this.verbose) console.log(`[${config.name}] Добавлен индекс: ${idxConfig.name}`);
  }

  private ensureTable(config: TableConfig, db: IDBDatabase, transaction: IDBTransaction) {
    if (db.objectStoreNames.contains(config.name)) {
      return transaction.objectStore(config.name);
    }
    let store = db.createObjectStore(config.name, {
      keyPath: config.keyPath,
      autoIncrement: config.autoIncrement,
    });
    if (this.verbose) console.log(`Создано хранилище: ${config.name}`);
    return store;
  }

  protected async transaction(storeNames: string | string[], mode: IDBTransactionMode): Promise<IDBTransaction> {
    this.db = await this.open();
    return this.db.transaction(storeNames, mode);
  }

  protected async getObjectStore(storeName: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const tx = await this.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  async put<T>(storeName: string, item: T): Promise<void> {
    const store = await this.getObjectStore(storeName, "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.put(item);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async putMany<T>(storeName: string, items: T[]): Promise<void> {
    const tx = await this.transaction(storeName, "readwrite");
    const store = await tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      for (const item of items) {
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
    const store = await this.getObjectStore(storeName, "readonly");
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    const store = await this.getObjectStore(storeName, "readonly");
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async delete(storeName: string, key: IDBValidKey): Promise<void> {
    const store = await this.getObjectStore(storeName, "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clear(storeName: string): Promise<void> {
    const store = await this.getObjectStore(storeName, "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

class Table<T> implements ITable<T> {
  private _database: IDatabase;
  private _config: TableConfig;

  constructor(database: IDatabase, config: TableConfig) {
    this._database = database;
    this._config = config;
  }

  get config(): TableConfig {
    return this._config;
  }

  get name(): string {
    return this._config.name;
  }

  get database(): IDatabase {
    return this._database;
  }

  async put(item: T): Promise<void> {
    return this.database.put(this.name, item);
  }

  async putMany(items: T[]): Promise<void> {
    return this.database.putMany(this.name, items);
  }

  async get(key: IDBValidKey): Promise<T | undefined> {
    return this.database.get<T>(this.name, key);
  }

  async getAll(): Promise<T[]> {
    return this.database.getAll<T>(this.name);
  }

  async delete(key: IDBValidKey): Promise<void> {
    return this.database.delete(this.name, key);
  }

  async clear(): Promise<void> {
    return this.database.clear(this.name);
  }
}
