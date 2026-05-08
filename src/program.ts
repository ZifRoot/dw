import { EmbeddingController } from "./api/EmbeddingController";
import { InitDb, InitDbAsync } from "./db/Initdb";
import { IRepository } from "./db/IRepository";
import { ChatSessions } from "./db/models/ChatSessions";
import { MessageFile } from "./db/models/MessageFile";
import { User } from "./db/models/User";
import { Deepseek, credentials } from "./deepseek";
import { dateStr, delay, div, groupToMap, groupToMapEm, safe, subtractSets, sum, sumA } from "./utils/data-utils";
import express from "express";
import swaggerUi from "swagger-ui-express";
import fs from "fs";
import path from "path";
import { Configuration, ModelsApi, EmbeddingsApi } from "./clients/embedder/fetch";
import { SingleExecution } from "./utils/single-runner";
import { LogExecution } from "./utils/logger";

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
  SessionkMap: Map<string, TaskX[]>;

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
    let models = (await this.modelApi.getModelsModelsGet()).models;

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
              let wait_mods = (this.SessionkMap.get(session.id) ?? []).map((t) => t.model_name);
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
              let task = await this.embeddingsApi.createTaskEmbeddingsPost({ computeRequest: { modelName: x.model_name, text: content } });
              task.taskId;
              return { taskId: task.taskId, len: content.length, sessionid: x.sessionid, model_name: x.model_name };
            }),
          );
        }),
      )
    ).flatMap((_) => _);

    for (const Task of Tasks) {
      this.TaskMap.set(Task.taskId, Task);
      let ss = this.SessionkMap.get(Task.sessionid) ?? [];
      ss.push(Task);
      this.SessionkMap.set(Task.sessionid, ss);
    }
  }

  @SingleExecution
  @LogExecution
  private async workEmbedding() {
    while (this.TaskMap.size > 0) {
      let completed_Tasks = (
        await this.embeddingsApi.listTasksEmbeddingsGet({
          statusFilter: "completed",
        })
      ).tasks;
      if (completed_Tasks.length == 0) {
        delay(500);
      }
      for (const completed_Task of completed_Tasks) {
        let task_local = this.TaskMap.get(completed_Task.taskId);
        if (task_local == null) continue;

        this.TaskMap.delete(completed_Task.taskId);

        var ts_sessions = this.SessionkMap.get(task_local.sessionid);
        if (ts_sessions == null) continue;

        let task = await this.embeddingsApi.getTaskEmbeddingsTaskIdGet({ taskId: task_local.taskId });

        task_local.result = task.result!;
        await this.embeddingsApi.deleteTaskEmbeddingsTaskIdDelete({ taskId: task_local.taskId });

        if (ts_sessions.every((t) => t.result != null)) {
          let embedding = ts_sessions.reduce((r, c) => sumA(r, c.result!), [0]);
          div(embedding, ts_sessions.length);

          this.repository.createEmbedding(task_local.sessionid, {
            model_name: task.modelName,
            dimension: embedding.length,
            embedding: embedding,
            createdAt: new Date(Date.now()),
            sessionId: task_local.sessionid,
            processing_time_ms: task.processingTimeMs!,
          });
          this.SessionkMap.delete(task_local.sessionid);
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
    this.SessionkMap = new Map();
    this.modelApi = new ModelsApi(new Configuration({ basePath: "http://localhost:8000" }));
    this.embeddingsApi = new EmbeddingsApi(new Configuration({ basePath: "http://localhost:8000" }));
  }
}
