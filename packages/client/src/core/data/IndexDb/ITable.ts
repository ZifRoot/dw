import { IIndex } from "./IIndex";
import { ITableInfo } from "./ITableInfo";

// Generic-интерфейс таблицы

export interface ITable<T, TKey = string> extends ITableInfo {
  put(item: T): Promise<void>;
  putMany(items: T[]): Promise<void>;
  get(key: TKey): Promise<T | undefined>;
  getAll(): Promise<T[]>;
  delete(key: TKey): Promise<void>;
  clear(): Promise<void>;

  indexes(): IIndex[];
}
