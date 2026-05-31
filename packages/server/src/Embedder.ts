import http from "node:http";
import { ModelsApi, EmbeddingsApi, Configuration, TaskShortResponse, TaskDetailResponse } from "@embedder";
import { subtractSets, delay } from "@utils/data-utils";
import { LogSafe, LogParamSafe } from "@utils/logger";
import { SingleExecution } from "@utils/single-runner";
import { sumA, mult, div } from "@utils/vector";
import { IRepository } from "./db/IRepository";

/**
 * Описание недостающей задачи перед созданием API-задач.
 */
interface MissingTaskDescriptor {
  model_name: string;
  sessionId: string;
}

/**
 * Внутреннее представление задачи с конкретным текстом фрагмента.
 */
interface FragmentTask {
  model_name: string;
  sessionId: string;
  text: string;
}

/**
 * Созданная задача (результат вызова API).
 */
interface CreatedTask {
  taskId: string;
  contentLength: number;
  sessionId: string;
  modelName: string;
  result?: number[];
  processing_time_ms?: number;
}

/**
 * Класс для управления процессом генерации эмбеддингов.
 * Отвечает за создание задач, их выполнение и сохранение результатов в БД.
 */
export class Embedder {
  private repository: IRepository;
  private modelApi: ModelsApi;
  private embeddingsApi: EmbeddingsApi;
  private tasks: Map<string, CreatedTask>;
  private sessionTaskMap: Map<string, CreatedTask[]>;
  private httpAgent: http.Agent;

  constructor(repository: IRepository) {
    this.repository = repository;
    this.tasks = new Map();
    this.sessionTaskMap = new Map();

    // Единый keep‑alive агент для HTTP соединений
    this.httpAgent = new http.Agent({
      keepAlive: true,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 60000,
      keepAliveMsecs: 1000,
    });

    const config = new Configuration({
      basePath: "http://localhost:8000",
      baseOptions: { httpAgent: this.httpAgent },
    });

    this.modelApi = new ModelsApi(config);
    this.embeddingsApi = new EmbeddingsApi(config);
  }

  /**
   * Основной метод обновления: создаёт задачи и запускает их обработку.
   */
  @LogSafe
  async Update(): Promise<void> {
    await this.CreateTasks();
    await this.workEmbedding();
  }

  /**
   * Создаёт недостающие задачи эмбеддинга для всех сессий и моделей.
   */
  @SingleExecution
  @LogSafe
  async CreateTasks(): Promise<void> {
    const modelNames = await this.getAvailableModelNames();
    const descriptors = await this.collectMissingTaskDescriptors(modelNames);
    const createdTasks = await this.createTasksForDescriptors(descriptors);
    this.storeCreatedTasks(createdTasks);
  }

  /**
   * Возвращает список имён доступных моделей из API.
   */
  private async getAvailableModelNames(): Promise<string[]> {
    const response = await this.modelApi.getModelsModelsGet();
    return response.data.models.map((model) => model.name);
  }

  /**
   * Собирает описания недостающих задач для всех пользователей и сессий.
   */
  private async collectMissingTaskDescriptors(modelNames: string[]): Promise<MissingTaskDescriptor[]> {
    const users = await this.repository.findAllUsers();
    const userTasks = await Promise.all(users.map((user) => this.getMissingTasksForUser(user.id, modelNames)));
    return userTasks.flat();
  }

  /**
   * Для одного пользователя находит все недостающие задачи по его сессиям.
   */
  private async getMissingTasksForUser(userId: string, modelNames: string[]): Promise<MissingTaskDescriptor[]> {
    const sessions = await this.repository.findAllSessions(userId);
    const sessionTasks = await Promise.all(sessions.map((session) => this.getMissingTasksForSession(session.id, modelNames)));
    return sessionTasks.flat();
  }

  /**
   * Для одной сессии определяет модели, для которых ещё нет эмбеддингов.
   */
  private async getMissingTasksForSession(sessionId: string, modelNames: string[]): Promise<MissingTaskDescriptor[]> {
    const existing = await this.repository.findEmbeddingsBySession(sessionId);
    const existingModels = existing.map((emb) => emb.model_name);
    const pendingModels = (this.sessionTaskMap.get(sessionId) ?? []).map((t) => t.modelName);
    const missingModels = subtractSets(subtractSets(modelNames, existingModels), pendingModels);
    return missingModels.map((model) => ({ model_name: model, sessionId }));
  }

  /**
   * Превращает дескрипторы в плоский список фрагментов с текстом.
   */
  private async expandDescriptorsToFragmentTasks(descriptors: MissingTaskDescriptor[]): Promise<FragmentTask[]> {
    const expanded = await Promise.all(descriptors.map((desc) => this.expandOneDescriptor(desc)));
    return expanded.flat();
  }

  /**
   * Для одного дескриптора находит все фрагменты типа RESPONSE и создаёт FragmentTask.
   */
  private async expandOneDescriptor(desc: MissingTaskDescriptor): Promise<FragmentTask[]> {
    const fragments = await this.repository.findAllFragments(desc.sessionId);
    const contents = fragments.filter((f) => f.type === "RESPONSE").map((f) => f.content);
    return contents.map((content) => ({
      model_name: desc.model_name,
      sessionId: desc.sessionId,
      text: content,
    }));
  }

  /**
   * Для каждого описания недостающей задачи создаёт реальные API-задачи на каждый фрагмент.
   */
  private async createTasksForDescriptors(descriptors: MissingTaskDescriptor[]): Promise<CreatedTask[]> {
    let fragmentTasks = await this.expandDescriptorsToFragmentTasks(descriptors);

    // Сортировка для детерминированного порядка (сначала по модели, затем по сессии)
    fragmentTasks.sort((a, b) => a.model_name.localeCompare(b.model_name) || a.sessionId.localeCompare(b.sessionId));

    let createdTasks: CreatedTask[] = [];

    for (const ft of fragmentTasks) {
      const apiTask = await this.embeddingsApi.createTaskEmbeddingsPost({
        model_name: ft.model_name,
        text: ft.text,
      });
      createdTasks.push({
        taskId: apiTask.data.task_id,
        contentLength: ft.text.length,
        sessionId: ft.sessionId,
        modelName: ft.model_name,
      });
    }

    return createdTasks;
  }

  /**
   * Сохраняет созданные задачи во внутренние карты.
   */
  private storeCreatedTasks(tasks: CreatedTask[]): void {
    for (const task of tasks) {
      this.tasks.set(task.taskId, task);
      const sessionTasks = this.sessionTaskMap.get(task.sessionId) ?? [];
      sessionTasks.push(task);
      this.sessionTaskMap.set(task.sessionId, sessionTasks);
    }
  }

  /**
   * Основной цикл обработки задач.
   */
  @SingleExecution
  @LogSafe
  private async workEmbedding(): Promise<void> {
    while (this.tasks.size > 0) {
      const stepPerformed = await this.workEmbeddingStep();
      if (!stepPerformed) await delay(2000);
    }
  }

  /**
   * Один шаг обработки: забирает завершённые задачи и обрабатывает их.
   * @returns true, если была обработана хотя бы одна задача, иначе false.
   */
  @LogSafe
  async workEmbeddingStep(): Promise<boolean> {
    const completed = (await this.embeddingsApi.listTasksEmbeddingsGet("completed")).data.tasks;
    if (completed.length === 0) return false;
    for (const task of completed) await this.workTask(task);
    return true;
  }

  /**
   * Обрабатывает одну завершённую задачу.
   */
  @LogParamSafe
  async workTask(completedTask: TaskShortResponse): Promise<void> {
    const localTask = await this.tryGetLocalTask(completedTask.task_id);
    if (!localTask) return;
    await this.processCompletedTask(localTask);
  }

  /**
   * Пытается получить локальную задачу из карты. Если её нет – удаляет удалённую задачу.
   * @returns локальная задача или null
   */
  private async tryGetLocalTask(taskId: string): Promise<CreatedTask | null> {
    const localTask = this.tasks.get(taskId);
    if (!localTask) {
      console.log("task miss");
      await this.embeddingsApi.deleteTaskEmbeddingsTaskIdDelete(taskId);
      return null;
    }
    this.tasks.delete(taskId);
    return localTask;
  }

  /**
   * Обрабатывает завершённую задачу: получает результат, обновляет локальные данные,
   * проверяет завершённость сессии и при необходимости агрегирует эмбеддинг.
   */
  private async processCompletedTask(localTask: CreatedTask): Promise<void> {
    const sessionTasks = this.sessionTaskMap.get(localTask.sessionId);
    if (!sessionTasks) {
      console.log("session miss");
      return;
    }
    const fullTask = await this.fetchAndDeleteRemoteTask(localTask.taskId);
    this.updateLocalTaskWithResult(localTask, fullTask);
    this.checkAndFinalizeSession(localTask.sessionId, sessionTasks);
  }

  /**
   * Получает полную информацию о задаче из API и удаляет её.
   */
  private async fetchAndDeleteRemoteTask(taskId: string): Promise<TaskDetailResponse> {
    const task = await this.embeddingsApi.getTaskEmbeddingsTaskIdGet(taskId);
    await this.embeddingsApi.deleteTaskEmbeddingsTaskIdDelete(taskId);
    return task.data;
  }

  /**
   * Обновляет локальную задачу результатом из API.
   */
  private updateLocalTaskWithResult(localTask: CreatedTask, apiTask: TaskDetailResponse): void {
    localTask.result = apiTask.result!;
    localTask.processing_time_ms = apiTask.processing_time_ms ?? undefined;
  }

  /**
   * Проверяет, все ли задачи сессии выполнены, и если да – запускает агрегацию.
   */
  private checkAndFinalizeSession(sessionId: string, sessionTasks: CreatedTask[]): void {
    const completedCount = sessionTasks.filter((t) => t.result !== undefined).length;
    console.log(`${completedCount}/${sessionTasks.length}`);
    if (completedCount === sessionTasks.length) {
      this.aggregateAndSaveEmbedding(sessionId, sessionTasks);
      this.sessionTaskMap.delete(sessionId);
    }
  }

  /**
   * Агрегирует эмбеддинги всех задач сессии и сохраняет в БД.
   */
  private async aggregateAndSaveEmbedding(sessionId: string, tasks: CreatedTask[]): Promise<void> {
    const embedding = this.computeAggregatedEmbedding(tasks);
    const totalTime = tasks.reduce((sum, t) => sum + (t.processing_time_ms ?? 0), 0);
    await this.repository.createEmbedding(sessionId, {
      model_name: tasks[0].modelName,
      dimension: embedding.length,
      embedding: embedding,
      createdAt: new Date(),
      sessionId: sessionId,
      processing_time_ms: totalTime,
    });
  }

  /**
   * Вычисляет усреднённый эмбеддинг по всем выполненным задачам сессии.
   */
  private computeAggregatedEmbedding(completed: CreatedTask[]): number[] {
    const weightedSum = completed.reduce((sum, t) => sumA(sum, mult(t.result!.slice(), t.contentLength)), [0]);
    const totalLen = completed.reduce((sum, t) => sum + t.contentLength, 0);
    return div(weightedSum, totalLen);
  }
}
