import http from "node:http";
import { LogSafe } from "@utils/logger";
import { SingleExecution } from "@utils/single-runner";
import { IRepository } from "./db/IRepository";

interface LmStudioModel {
  type: string;
  publisher?: string;
  key: string;
  display_name?: string;
  architecture?: string;
  quantization?: {
    name: string;
    bits_per_weight: number;
  };
  size_bytes?: number;
  params_string?: string | null;
  loaded_instances?: unknown[];
  max_context_length?: number;
  format?: string;
  capabilities?: {
    vision: boolean;
    trained_for_tool_use?: boolean;
  };
  description?: string | null;
}

interface LmStudioModelsResponse {
  models: LmStudioModel[];
}

/**
 * Класс для управления процессом генерации эмбеддингов через LM Studio.
 * Отвечает за получение эмбеддингов напрямую через API LM Studio.
 */
export class EmbedderLmStudio {
  private repository: IRepository;
  private baseUrl: string;
  private httpAgent: http.Agent;
  private availableEmbeddingModels: LmStudioModel[] | null = null;

  constructor(repository: IRepository, baseUrl: string = "http://localhost:1234") {
    this.repository = repository;
    this.baseUrl = baseUrl;

    // Единый keep-alive агент для HTTP соединений
    this.httpAgent = new http.Agent({
      keepAlive: true,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 60000,
      keepAliveMsecs: 1000,
    });
  }

  /**
   * Получает список доступных embedding-моделей из LM Studio.
   * Использует endpoint /api/v1/models и фильтрует по type: "embedding".
   * Кэширует результат для последующих вызовов.
   */
  private async getAvailableEmbeddingModels(): Promise<LmStudioModel[]> {
    if (this.availableEmbeddingModels !== null) {
      return this.availableEmbeddingModels;
    }

    const url = `${this.baseUrl}/api/v1/models`;

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

      const data: LmStudioModelsResponse = await response.json();

      if (!data.models || !Array.isArray(data.models)) {
        throw new Error("Invalid response from LM Studio: no models data");
      }

      // Фильтруем только embedding модели по полю type
      this.availableEmbeddingModels = data.models.filter(model => model.type === "embedding");

      console.log(`Доступные embedding модели LM Studio: ${this.availableEmbeddingModels.map(m => m.key).join(", ")}`);

      return this.availableEmbeddingModels;
    } catch (error) {
      console.error(`Ошибка получения списка моделей LM Studio: ${error}`);
      throw error;
    }
  }

  /**
   * Сбрасывает кэш моделей для принудительного обновления.
   */
  public resetModelsCache(): void {
    this.availableEmbeddingModels = null;
  }

  /**
   * Основной метод обновления: создаёт задачи и запускает их обработку.
   */
  @LogSafe
  async Update(): Promise<void> {
    await this.processPendingEmbeddings();
  }

  /**
   * Обрабатывает все pending эмбеддинги для сессий.
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
   * Создаёт эмбеддинги для всех доступных embedding-моделей.
   */
  private async processSessionEmbedding(session: { id: string; user_id: string }): Promise<void> {
    // Получаем список доступных embedding-моделей из LM Studio
    const availableModels = await this.getAvailableEmbeddingModels();

    if (availableModels.length === 0) {
      console.warn(`LM Studio не имеет доступных embedding-моделей для сессии ${session.id}`);
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

    // Создаём эмбеддинги для всех доступных embedding-моделей
    for (const model of availableModels) {
      const modelName = model.key;

      // Проверяем, есть ли уже эмбеддинг для этой сессии и модели
      const existingEmbedding = await this.repository.findEmbeddingBySessionAndModel(session.id, modelName);
      if (existingEmbedding !== null) {
        continue; // Уже есть эмбеддинг для этой пары (session, model)
      }

      // Получаем эмбеддинг через LM Studio
      const startTime = Date.now();
      const embedding = await this.getEmbedding(combinedText, modelName);
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

      console.log(`Обработан эмбеддинг для сессии ${session.id}, модель: ${modelName}, размер: ${embedding.length}`);
    }
  }

  /**
   * Получает эмбеддинг для текста через API LM Studio.
   * LM Studio использует OpenAI-compatible API: POST /v1/embeddings
   */
  private async getEmbedding(text: string, modelName: string): Promise<number[]> {
    const url = `${this.baseUrl}/v1/embeddings`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      agent: this.httpAgent,
      body: JSON.stringify({
        input: text,
        model: modelName,
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
