/**
 * Тип для создания/обновления пользователя.
 * id опционален, так как может генерироваться БД.
 */
export type UserCreate = {
  id?: string;
  name: string;
  credentials?: unknown | null;
};
