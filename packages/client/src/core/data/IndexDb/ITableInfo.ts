import { IDatabase } from "./IDatabase";
import { TableConfig } from "./TableConfig";


export interface ITableInfo {
  readonly config: TableConfig;
  readonly name: string;
  readonly database: IDatabase;
}
