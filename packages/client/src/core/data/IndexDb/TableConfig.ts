
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
