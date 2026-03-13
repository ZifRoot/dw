import { normalizeUUID } from "../../utils/data-utils";
import { UserCreate } from "./UserCreate";

/**
 * Модель пользователя.
 * Соответствует записи в таблице userTable.
 */
export class User {
  public id: string;
  public name: string;
  public credentials: unknown | null;

  constructor(data: UserCreate) {
    this.id = normalizeUUID(data.id) ?? crypto.randomUUID();
    this.name = data.name;
    this.credentials = data.credentials ?? null;
  }
}
