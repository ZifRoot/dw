import http from "node:http";
import { LogSafe } from "@utils/logger";
import { SingleExecution } from "@utils/single-runner";
import { IRepository } from "./db/IRepository";

/**
 * Класс для управления процессом генерации эмбеддингов через LM Studio.
 * Отвечает за получение эмбеддингов напрямую через API LM Studio.
 */
export class EmbedderLmStudio {
  private repository: IRepository;
  private baseUrl: string;
  private httpAgent: http.Agent;
  private availableModels: Set<string> | null = null;

  constructor(repository: IRepository, baseUrl: string = "http://localhost:1234") {
    this.repository = repository;
    this.baseUrl = baseUrl;

    // Единый keep‑alive агент для HTTP соединений
    this.httpAgent = new http.Agent({
      keepAlive: true,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 60000,
      keepAliveMsecs: 1000,
    });
  }

  /**
   * Получает список доступных моделей из LM Studio.
   * Кэширует результат для последующих вызовов.
   */
  private async getAvailableModels(): Promise<Set<string>> {
    if (this.availableModels !== null) {
      return this.availableModels;
    }

    const url = `${this.baseUrl}/v1/models`;
    
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        agent: this.httpAgent,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LM Studio API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      
      // LM Studio возвращает ответ в формате OpenAI: { data: [{ id: "model-name" }, ...], ... }
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error("Invalid response from LM Studio: no models data");
      }

      this.availableModels = new Set(data.data.map((model: { id: string }) => model.id));
      
      console.log(`Доступные модели LM Studio: ${Array.from(this.availableModels).join(", ")}`);
      
      return this.availableModels;
    } catch (error) {
      console.error(`Ошибка получения списка моделей LM Studio: ${error}`);
      throw error;
    }
  }

  /**
   * Сбрасывает кэш моделей для принудительного обновления.
   */
  public resetModelsCache(): void {
    this.availableModels = null;
  }

  /**
   * Основной метод обновления: создаёт задачи и запускает их обработку.
   */
  @LogSafe
  async Update(): Promise<void> {
    await this.processPendingEmbeddings();
  }

  /**
   * Обрабатывает все_pending эмбеддинги для сессий.
   */
  @SingleExecution
  @LogSafe
  async processPendingEmbeddings(): Promise<void> {
    const sessions = await this.getAllSessionsWithPendingEmbeddings();
    for (const session of sessions) {
      await this.processSessionEmbedding(session);
    }
  }

  /**
   * Получает все сессии, для которых нужны эмбеддинги.
   */
  private async getAllSessionsWithPendingEmbeddings(): Promise<Array<{ id: string; user_id: string }>> {
    const users = await this.repository.findAllUsers();
    const allSessions: Array<{ id: string; user_id: string }> = [];

    for (const user of users) {
      const sessions = await this.repository.findAllSessions(user.id);
      allSessions.push(...sessions);
    }

    return allSessions;
  }

  /**
   * Обрабатывает эмбеддинг для одной сессии.
   */
  private async processSessionEmbedding(session: { id: string; user_id: string }): Promise<void> {
    const modelName = "lm-studio";

    // Проверяем, есть ли уже эмбеддинг для этой сессии и модели
    const existingEmbedding = await this.repository.findEmbeddingBySessionAndModel(session.id, modelName);
    if (existingEmbedding !== null) {
      return; // Уже есть эмбеддинг для этой пары (session, model)
    }

    // Получаем список доступных моделей из LM Studio
    const availableModels = await this.getAvailableModels();
    
    // Проверяем, есть ли нужная модель в LM Studio
    // Ищем модель, содержащую "embedding" или любую доступную модель для эмбеддингов
    if (availableModels.size === 0) {
      console.warn(`LM Studio не имеет доступных моделей для эмбеддинга сессии ${session.id}`);
      return;
    }

    // Получаем все фрагменты типа RESPONSE
    const fragments = await this.repository.findAllFragments(session.id);
    const responseFragments = fragments.filter((f) => f.type === "RESPONSE");

    if (responseFragments.length === 0) {
      return; // Нет фрагментов для обработки
    }

    // Объединяем текст всех фрагментов
    const combinedText = responseFragments.map((f) => f.content).join("\n\n");

    // Получаем эмбеддинг через LM Studio
    const startTime = Date.now();
    const embedding = await this.getEmbedding(combinedText);
    const processingTime = Date.now() - startTime;

    // Сохраняем эмбеддинг в БД
    await this.repository.createEmbedding(session.id, {
      model_name: modelName,
      dimension: embedding.length,
      embedding: embedding,
      createdAt: new Date(),
      sessionId: session.id,
      processing_time_ms: processingTime,
    });

    console.log(`Обработан эмбеддинг для сессии ${session.id}, размер: ${embedding.length}`);
  }

  /**
   * Получает эмбеддинг для текста через API LM Studio.
   * LM Studio использует OpenAI-compatible API: POST /v1/embeddings
   */
  private async getEmbedding(text: string, modelName?: string): Promise<number[]> {
    const url = `${this.baseUrl}/v1/embeddings`;
    
    // Если модель не указана, используем первую доступную модель
    let modelToUse = modelName;
    if (!modelToUse) {
      const availableModels = await this.getAvailableModels();
      if (availableModels.size === 0) {
        throw new Error("No models available in LM Studio");
      }
      // Используем первую доступную модель
      modelToUse = Array.from(availableModels)[0];
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      agent: this.httpAgent,
      body: JSON.stringify({
        input: text,
        model: modelToUse,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LM Studio API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    // LM Studio возвращает ответ в формате OpenAI: { data: [{ embedding: [...] }], ... }
    if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
      throw new Error("Invalid response from LM Studio: no embedding data");
    }

    return data.data[0].embedding;
  }
}
