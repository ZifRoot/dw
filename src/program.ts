import { EmbeddingController } from "./api/EmbeddingController";
import { InitDb, InitDbAsync } from "./db/Initdb";
import { IRepository } from "./db/IRepository";
import { ChatSessions } from "./db/models/ChatSessions";
import { MessageFile } from "./db/models/MessageFile";
import { User } from "./db/models/User";
import { Deepseek, credentials } from "./deepseek";
import { dateStr, delay, div, groupToMap, groupToMapEm, mult, safe, subtractSets, sum, sumA } from "./utils/data-utils";
import express from "express";
import swaggerUi from "swagger-ui-express";
import fs from "fs";
import path from "path";
import { Configuration, ModelsApi, EmbeddingsApi } from "./clients/embedder/axios";
import { SingleExecution } from "./utils/single-runner";
import { LogExecution } from "./utils/logger";
import http from "node:http";

interface TaskX {
  taskId: string;
  len: number;
  sessionid: string;
  model_name: string;
  result?: number[];
}

export class Program {
  repository!: IRepository;
  modelApi: ModelsApi;
  embeddingsApi: EmbeddingsApi;
  TaskMap: Map<string, TaskX>;
  SessionMap: Map<string, TaskX[]>;
  apiAgent: http.Agent;

  async start() {
    await this.RepositoryAsync();

    const app = express();
    app.use(express.json());

    const embeddingController = new EmbeddingController(this);
    app.use("/api", embeddingController.getRouter());

    // 1. Загружаем готовый openapi.json (если сгенерировали заранее)

    // 2. Подключаем Swagger UI по пути /api-docs
    app.use("/api", swaggerUi.serve, (rq: any, rs: any, n: any) => {
      const swaggerDocument = JSON.parse(fs.readFileSync("./openapi.json", "utf8"));
      swaggerUi.setup(swaggerDocument)(rq, rs, n);
    });

    let clientPath = path.join(process.cwd(), "client", "dist");

    app.use(express.static(clientPath));

    const PORT = process.env.PORT || 8081;
    app.listen(PORT, () => {
      console.log(`Server running http://localhost:${PORT}/ |`);
    });

    // await this.Update();
    console.log("repository ready");
  }

  async Update() {
    await this.ExecUsers();
  }

  @LogExecution
  async UpdateEmbedding() {
    // await this.recoverEmbedding();
    await this.CreateTasks();

    await this.workEmbedding();
  }

  @SingleExecution
  @LogExecution
  async CreateTasks() {
    await this.RepositoryAsync();
    if (!this.repository) {
      console.error("null repository");
      return;
    }
    let models = (await this.modelApi.getModelsModelsGet()).data.models;

    let modelNames = models.map((m) => m.name);

    console.log(models);

    let users = await this.repository.findAllUsers();
    let _x = await Promise.all(
      users.map(async (user) => {
        let sessions = await this.repository.findAllSessions(user.id);
        return (
          await Promise.all(
            sessions.map(async (session) => {
              let embs = await this.repository.findEmbeddingsBySession(session.id);
              let have_mods = embs.map((emb) => emb.model_name);
              let wait_mods = (this.SessionMap.get(session.id) ?? []).map((t) => t.model_name);
              let model_news = subtractSets(subtractSets(modelNames, have_mods), wait_mods);

              return model_news.map((model_new) => ({ model_name: model_new, userid: user.id, sessionid: session.id }));
            }),
          )
        ).flatMap((a) => a);
      }),
    );
    let xs = _x.flatMap((_) => _);

    xs.sort((a, b) => a.model_name.localeCompare(b.model_name));

    var Tasks = (
      await Promise.all(
        xs.map(async (x) => {
          let frags = await this.repository.findAllFragments(x.sessionid);

          let contents = frags.filter((f) => f.type == "RESPONSE").map((f) => f.content);

          return await Promise.all(
            contents.map(async (content) => {
              let task = (await this.embeddingsApi.createTaskEmbeddingsPost({ model_name: x.model_name, text: content })).data;
              return { taskId: task.task_id, len: content.length, sessionid: x.sessionid, model_name: x.model_name };
            }),
          );
        }),
      )
    ).flatMap((_) => _);

    for (const Task of Tasks) {
      this.TaskMap.set(Task.taskId, Task);
      let ss = this.SessionMap.get(Task.sessionid) ?? [];
      ss.push(Task);
      this.SessionMap.set(Task.sessionid, ss);
    }
  }

  @SingleExecution
  @LogExecution
  private async workEmbedding() {
    while (this.TaskMap.size > 0) {
      let completed_Tasks = (await this.embeddingsApi.listTasksEmbeddingsGet("completed")).data.tasks;
      if (completed_Tasks.length == 0) {
        await delay(500);
      }
      for (const completed_Task of completed_Tasks) {
        let task_local = this.TaskMap.get(completed_Task.task_id);

        if (task_local == null) {
          await this.embeddingsApi.deleteTaskEmbeddingsTaskIdDelete(completed_Task.task_id);
          continue;
        }
        this.TaskMap.delete(completed_Task.task_id);

        var ts_sessions = this.SessionMap.get(task_local.sessionid);
        if (ts_sessions == null) continue;

        let task = (await this.embeddingsApi.getTaskEmbeddingsTaskIdGet(task_local.taskId)).data;

        task_local.result = task.result!;
        await this.embeddingsApi.deleteTaskEmbeddingsTaskIdDelete(task_local.taskId);

        if (ts_sessions.every((t) => t.result != null)) {
          let embedding = ts_sessions.reduce((r, c) => sumA(r, mult(c.result!.slice(), c.len)), [0]);
          let len = ts_sessions.reduce((r, c) => c.len + r, 0);
          div(embedding, len);

          this.repository.createEmbedding(task_local.sessionid, {
            model_name: task.model_name,
            dimension: embedding.length,
            embedding: embedding,
            createdAt: new Date(Date.now()),
            sessionId: task_local.sessionid,
            processing_time_ms: task.processing_time_ms!,
          });
          this.SessionMap.delete(task_local.sessionid);
        }
      }
    }
  }

  @LogExecution
  async ExecUsers() {
    await this.RepositoryAsync();
    if (!this.repository) {
      console.error("null repository");
      return;
    }
    let users = await this.repository.findAllUsers();
    await Promise.all(users.map((user) => this.ExecUser(user, true)));
  }

  async ExecUser(user: User, all: boolean) {
    if (!this.repository) {
      console.error("null repository");
      return;
    }

    console.log(`User: ${user.name}`);

    let deepseek = new Deepseek(user.credentials as credentials);
    await this.FetchUser(deepseek, user, all);
    await this.FilesUser(deepseek, user);
  }

  @LogExecution
  private async FilesUser(deepseek: Deepseek, user: User) {
    if (!this.repository) {
      console.error("null repository");
      return;
    }
    let map = new Map<string, MessageFile>();
    let sessions = await this.repository.findAllSessions(user.id);

    for (const session of sessions) {
      let messages = await this.repository.findAllMessages(session.id);

      for (const message of messages) {
        let files = await this.repository.findAllFilesByMessage(message.sessionId, message.messageId);
        for (const file of files) {
          if (!map.has(file.id)) {
            map.set(file.id, file);
          }
        }
      }
    }

    let files = [...map.values()];

    files = files.filter((f) => f.content == null);

    console.log(`Файлов для скачевания ${files.length} будет скачено ${files.length}`);

    let filesAs = files.map((file) => this.file_2(deepseek, file));

    await Promise.all(filesAs);
  }

  private async file_2(deepseek: Deepseek, file: MessageFile) {
    return safe(() => this.file_1(deepseek, file));
  }

  private async file_1(deepseek: Deepseek, file: MessageFile) {
    console.log(`Качаю ${file.file_name} | байт ${file.file_size}`);
    let text = await deepseek.file(file.id, file.sessionId, file.messageId);
    const mf = new MessageFile({ ...file, content: text });
    await this.repository!.createManyFiles([mf]);
    console.log(`Успешно скачено ${file.file_name} | байт ${file.file_size}`);
    return mf;
  }

  @LogExecution
  private async FetchUser(deepseek: Deepseek, user: User, all: boolean) {
    if (!this.repository) {
      console.error("null repository");
      return;
    }
    let fetch_page = all ? await deepseek.fetch_page_all() : (await deepseek.fetch_page()).chat_sessions;
    let first_page = fetch_page.at(-1);
    // console.log(`Page: ${first_page?.title} ${dateStr(first_page?.updated_at)}`);
    let sessions = await this.repository.findAllSessions(user.id);

    const map_sessions = new Map(sessions.map((obj) => [obj.id!, obj]));

    let in_sessions = fetch_page.map((s) => new ChatSessions({ ...s, user_id: user.id }));

    let sessions_for_update = in_sessions
      .map((in_session) => ({ in_session: in_session, db_session: map_sessions.get(in_session.id) }))
      .filter((s) => {
        if (s.db_session == null) return true;
        let date1 = s.db_session.updated_at;
        let date2 = s.in_session.updated_at;

        const sec1 = date1.getTime() / 1000;
        const sec2 = date2.getTime() / 1000;

        const diff = Math.abs(sec1 - sec2) > 1;

        return diff;
      });

    await Promise.all(sessions_for_update.map((s) => this.user_2(s, deepseek, user)));
  }

  private async user_2(s: { in_session: ChatSessions; db_session: ChatSessions | undefined }, deepseek: Deepseek, user: User) {
    return safe(() => this.user_1(s, deepseek, user));
  }

  private async user_1(s: { in_session: ChatSessions; db_session: ChatSessions | undefined }, deepseek: Deepseek, user: User) {
    let session = s.db_session ?? s.in_session;
    console.log(
      `Обновление: ${s.db_session == null ? "новый" : `(${dateStr(s.db_session.updated_at)})->(${dateStr(s.in_session.updated_at)}) `} [${session.title}]`,
    );

    let his = await deepseek.history_messages(session.id, session.version);

    await this.repository.createMessagesBizData(user.id, his);
  }

  @LogExecution
  Repository() {
    return (this.repository = this.repository || InitDb());
  }

  @LogExecution
  async RepositoryAsync() {
    return (this.repository = this.repository || (await InitDbAsync()));
  }

  constructor() {
    this.TaskMap = new Map();
    this.SessionMap = new Map();
    // Агент для http (на localhost:8000)
    this.apiAgent = new http.Agent({
      keepAlive: true,
      maxSockets: 50, // макс. одновременных соединений к одному хосту
      maxFreeSockets: 10, // сколько свободных держать открытыми
      timeout: 60000, // таймаут на установку соединения
      keepAliveMsecs: 1000,
    });

    // Единый keep‑alive агент
    this.apiAgent = new http.Agent({
      keepAlive: true,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 60000,
      keepAliveMsecs: 1000,
    });

    // Одна конфигурация для всех API
    const config = new Configuration({
      basePath: "http://localhost:8000",
      baseOptions: {
        httpAgent: this.apiAgent, // ✅ полностью типизировано
      },
    });

    this.modelApi = new ModelsApi(config);
    this.embeddingsApi = new EmbeddingsApi(config);
  }
}
