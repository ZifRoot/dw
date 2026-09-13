// Таблица сохранённых связей (рёбер) графа.
// id совпадает с конвенцией EdgeModel: `${sourceId}-${targetId}`.
export interface EdgeTable {
  id: string;
  source_id: string;
  target_id: string;
  model_name?: string;
  distance?: number;
  updated_at: number;
}
