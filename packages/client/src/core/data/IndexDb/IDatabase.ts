import { ITableInfo } from "./ITableInfo";

export interface IDatabase {
  open(): Promise<IDBDatabase>;
  close(): Promise<void>;
  // transaction(storeNames: string | string[], mode: IDBTransactionMode): Promise<IDBTransaction>;
  put<T>(storeName: string, item: T): Promise<void>;
  putMany<T>(storeName: string, items: T[]): Promise<void>;
  get<T, TKey>(storeName: string, key: TKey): Promise<T | undefined>;
  getAll<T>(storeName: string): Promise<T[]>;
  delete<TKey>(storeName: string, key: TKey): Promise<void>;
  clear(storeName: string): Promise<void>;
  readonly tables: readonly ITableInfo[];
}
