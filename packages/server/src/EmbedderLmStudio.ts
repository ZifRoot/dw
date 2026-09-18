import { LogSafe } from "@utils/logger";
import { SingleExecution } from "@utils/single-runner";
import { IRepository } from "./db/IRepository";

interface LmStudioLoadedInstance {
  id?: string;
  context_length?: number;
  state?: string;
}

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
  loaded_instances?: LmStudioLoadedInstance[];
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
  private models: LmStudioModel[] | null = null;

  constructor(repository: IRepository, baseUrl: string = "http://localhost:1234") {
    this.repository = repository;
    this.baseUrl = baseUrl;
  }

  /**
   * Получает список доступных embedding-моделей из LM Studio.
   * Использует endpoint /api/v1/models и фильтрует по type: "embedding".
   * Кэширует результат для последующих вызовов.
   */
  private async getAvailableEmbeddingModels(): Promise<LmStudioModel[]> {
    const url = `${this.baseUrl}/api/v1/models`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
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

      return data.models.filter((model) => model.type === "embedding");
    } catch (error) {
      console.error(`Ошибка получения списка моделей LM Studio: ${error}`);
      throw error;
    }
  }

  private async getModels(): Promise<LmStudioModel[]> {
    if (this.models !== null) {
      return this.models;
    }
    this.models = this.prioritizeModels(await this.getAvailableEmbeddingModels());
    return this.models;
  }

  /**
   * Сбрасывает кэш моделей для принудительного обновления.
   */
  public resetModelsCache(): void {
    this.models = null;
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
   * Оптимизировано: сначала получаем модели, затем обрабатываем сессии,
   * используя уже загруженные модели в приоритете.
   */
  @SingleExecution
  @LogSafe
  async processPendingEmbeddings(): Promise<void> {
    // Получаем доступные embedding-модели один раз для всех сессий
    const models = await this.getModels();

    if (models.length === 0) {
      console.warn("LM Studio не имеет доступных embedding-моделей");
      return;
    }

    // Обрабатываем по сессиям, затем по моделям (избегаем переключения моделей)
    for (const model of models) {
      const sessions = await this.getAllSessionsWithPendingEmbeddings();
      for (const session of sessions) {
        await this.processSessionWithModels(session, model);
      }
    }
  }

  /**
   * Получает все сессии, для которых нужны эмбеддинги.
   */
  private async getAllSessionsWithPendingEmbeddings(): Promise<string[]> {
    const users = await this.repository.findAllUsers();
    const allSessions: string[] = [];

    for (const user of users) {
      const sessions = await this.repository.findAllSessions(user.id);
      for (const session of sessions) {
        allSessions.push(session.id);
      }
    }

    return allSessions;
  }

  /**
   * Приоритизирует модели: сначала уже загруженные (loaded_instances > 0),
   * затем остальные. Это минимизирует переключение моделей в LM Studio.
   */
  private prioritizeModels(models: LmStudioModel[]): LmStudioModel[] {
    return [...models].sort((a, b) => {
      const aLoaded = a.loaded_instances?.length ?? 0;
      const bLoaded = b.loaded_instances?.length ?? 0;
      return bLoaded - aLoaded; // Загруженные модели первыми
    });
  }

  /**
   * Обрабатывает эмбеддинг для одной сессии со списком моделей.
   * Использует instance identifier если доступен, иначе key модели.
   */
  private async processSessionWithModels(sessionid: string, model: LmStudioModel): Promise<void> {
    // Используем instance identifier если модель загружена, иначе key
    const modelName = await this.getModelIdentifier(model);
    // Проверяем, есть ли уже эмбеддинг для этой сессии и модели
    const existingEmbedding = await this.repository.findEmbeddingBySessionAndModel(sessionid, modelName);
    if (existingEmbedding !== null) {
      return; // Уже есть эмбеддинг для этой пары (session, model)
    }
    // Получаем все фрагменты типа RESPONSE
    const fragments = await this.repository.findAllFragments(sessionid);
    const responseFragments = fragments.filter((f) => f.type === "RESPONSE");

    if (responseFragments.length === 0) {
      return; // Нет фрагментов для обработки
    }

    // Объединяем текст всех фрагментов
    const combinedText = responseFragments.map((f) => f.content).join("\n\n");

    // Получаем эмбеддинг через LM Studio
    const startTime = Date.now();
    const embedding = await this.getEmbedding(combinedText, modelName);
    const processingTime = Date.now() - startTime;

    // Сохраняем эмбеддинг в БД
    await this.repository.createEmbedding(sessionid, {
      model_name: modelName,
      dimension: embedding.length,
      embedding: embedding,
      createdAt: new Date(),
      sessionId: sessionid,
      processing_time_ms: processingTime,
    });

    console.log(`Обработан эмбеддинг для сессии ${sessionid}, модель: ${modelName}, размер: ${embedding.length}`);
  }

  getIns(model: LmStudioModel) {
    if (model.loaded_instances && model.loaded_instances.length > 0) {
      const instance = model.loaded_instances[0];
      if (instance.id) {
        return instance.id;
      }
    }
    return null;
  }

  /**
   * Возвращает идентификатор модели для API.
   * Если модель имеет загруженные экземпляры, использует их identifier.
   * Иначе использует key модели.
   */
  private async getModelIdentifier(model?: LmStudioModel): Promise<string> {
    model = (await this.getModels()).find((m) => m.key == model?.key)!;
    let ins = this.getIns(model);
    if (ins != null) return ins;
    // Если есть загруженные экземпляры, используем identifier первого

    // Нет загруженных экземпляров - загружаем модель
    console.log(`Модель ${model.key} не загружена, загружаем...`);
    await this.loadModel(model.key);

    this.resetModelsCache();

    // После загрузки получаем обновлённый список моделей
    model = (await this.getModels()).find((m) => m.key == model?.key)!;
    return this.getIns(model) ?? model.key;
  }

  /**
   * Загружает модель в LM Studio через API.
   */
  private async loadModel(modelKey: string): Promise<void> {
    const url = `${this.baseUrl}/api/v1/models/load`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelKey,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LM Studio API error loading model: ${response.status} ${errorText}`);
      }

      console.log(`Модель ${modelKey} успешно загружена`);
    } catch (error) {
      console.error(`Ошибка загрузки модели ${modelKey}: ${error}`);
      throw error;
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
