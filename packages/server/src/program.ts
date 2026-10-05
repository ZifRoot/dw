import express from "express";
import path from "path";

import { InitDb, InitDbAsync } from "./db/Initdb";
import { IRepository } from "./db/IRepository";
import { ChatSessions } from "@models/ChatSessions";
import { MessageFile } from "@models/MessageFile";
import { User } from "@models/User";
import { DW, credentials } from "./dw";

import { IProgram } from "./iprogram";
import { createExpressApp } from "./controllers";

import { SingleExecution } from "@utils/single-runner";
// import { LogSafe, Safe } from "@utils/logger";
import { dateStr } from "@utils/date-utils";
import { LogSafe, Safe } from "@utils/logger";
import { EmbedderLmStudio } from "./EmbedderLmStudio";
import { AsyncPool } from "@utils/async-pool";
import { createDatabaseBackup } from "./db/database-runtime";

const FILE_DOWNLOAD_CONCURRENCY = 4;

export class Program implements IProgram {
  repository!: IRepository;
  embedder!: EmbedderLmStudio;
  private readonly fileDownloadPool = new AsyncPool(FILE_DOWNLOAD_CONCURRENCY);

  async start() {
    await this.RepositoryAsync();

    this.embedder = new EmbedderLmStudio(this.repo());
    const app = express();
    app.use(express.json());

    createExpressApp(this, app);

    let clientPath = path.join(process.cwd(), "..", "client", "dist");

    app.use(express.static(clientPath));

    const PORT = +(process.env.PORT || 8081);
    app.listen(PORT, "127.0.0.1", () => {
      console.log(`Server running http://localhost:${PORT}/ |`);
    });
  }

  @LogSafe
  async Update() {
    await this.ExecUsers();
  }

  @LogSafe
  async UpdateEmbedding() {
    await this.embedder.Update();
  }

  @SingleExecution
  @LogSafe
  async ExecUsers() {
    await this.RepositoryAsync();
    if (!this.repository) {
      console.error("null repository");
      return;
    }
    let users = await this.repository.findAllUsers();
    await Promise.all(users.map((user) => this.ExecUser(user, false)));
  }

  async ExecUser(user: User, all: boolean) {
    if (!this.repository) {
      console.error("null repository");
      return;
    }

    console.log(`User: ${user.name}`);

    let dw = new DW(user.credentials as credentials);
    await this.FetchUser(dw, user, all);
    await this.FilesUser(dw, user);
  }

  @LogSafe
  private async FilesUser(dw: DW, user: User) {
    if (!this.repository) {
      console.error("null repository");
      return;
    }
    let map = new Map<string, MessageFile>();
    let sessions = await this.repository.findAllSessions(user.id);

    let files_x = await Promise.all(sessions.map((session) => this.repository.findAllFilesNullContent(session.id)));
    let files = files_x.flat().uniqueBy((f) => f.id);

    files = files.filter((f) => f.content == null);

    console.log(`Файлов для скачевания ${files.length} будет скачено ${files.length}`);

    await this.fileDownloadPool.run(
      files.map((file) => () => this.file_1(dw, file)),
    );
  }

  @Safe
  private async file_1(dw: DW, file: MessageFile) {
    console.log(`Качаю ${file.file_name} | байт ${file.file_size}`);
    let text = await dw.file(file.id, file.sessionId, file.messageId);
    const mf = new MessageFile({ ...file, content: text });
    await this.repository!.createManyFiles([mf]);
    console.log(`Успешно скачено ${file.file_name} | байт ${file.file_size}`);
    return mf;
  }

  @LogSafe
  private async FetchUser(dw: DW, user: User, all: boolean) {
    if (!this.repository) {
      console.error("null repository");
      return;
    }
    let fetch_page = all ? await dw.fetch_page_all() : (await dw.fetch_page()).chat_sessions;
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

    await Promise.all(sessions_for_update.map((s) => this.user_1(s, dw, user)));
  }

  @Safe
  private async user_1(s: { in_session: ChatSessions; db_session: ChatSessions | undefined }, dw: DW, user: User) {
    let session = s.db_session ?? s.in_session;
    console.log(
      `Обновление: ${s.db_session == null ? "новый" : `(${dateStr(s.db_session.updated_at)})->(${dateStr(s.in_session.updated_at)}) `} [${session.title}]`,
    );

    let his = await dw.history_messages(session.id, session.version);

    await this.repository.createMessagesBizData(user.id, his);
  }

  @LogSafe
  Repository() {
    return (this.repository = this.repository || InitDb());
  }

  @LogSafe
  async RepositoryAsync() {
    return (this.repository = this.repository || (await InitDbAsync()));
  }

  constructor() {}
  repo() {
    return this.repository;
  }
}
