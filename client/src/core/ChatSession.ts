// =============================== DTO (интерфейсы с сервера) ===============================
/// <summary>Сессия чата (ответ от API /documents).</summary>

export interface ChatSession {
  id: string;
  title: string;
  title_type: string;
  pinned: boolean;
  updated_at: number;
}
