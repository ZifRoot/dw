import { TableConfig } from "./TableConfig";
import { IDatabase } from "./IDatabase";
import { ITable } from "./ITable";
import { IIndex } from "./IIndex";

export class Table<T, TKey = string> implements ITable<T, TKey> {
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

  async get(key: TKey): Promise<T | undefined> {
    return this.database.get<T, TKey>(this.name, key);
  }

  async getAll(): Promise<T[]> {
    return this.database.getAll<T>(this.name);
  }

  async delete(key: TKey): Promise<void> {
    return this.database.delete<TKey>(this.name, key);
  }

  async clear(): Promise<void> {
    return this.database.clear(this.name);
  }
  indexes(): IIndex[] {
    throw new Error("Method not implemented.");
  }
}
