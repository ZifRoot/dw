import { InitDb } from "./db/Initdb";
import { IRepository } from "./db/IRepository";
import { credentials, Deepseek } from "./deepseek";
import { ChatSessions } from "./db/models/ChatSessions";
import { User } from "./db/models/User";
import { dateStr } from "./utils/data-utils";
import { startAndWaitAsync } from "./db/db-manager";
import express from "express";
import { EmbeddingController } from "./api/EmbeddingController";
import { MessageFile } from "./db/models/MessageFile";

// import { EmbeddingPipeline } from "./getEmbeddings";

class Program {
  repository?: IRepository;

  async start() {
    // let r = await EmbeddingPipeline.getInstance();
    //await getEmbeddings();

    await this.F();

    console.log("DONE");
  }

  async F() {
    // await startAndWaitAsync();
    this.repository = InitDb();
    await this.s1();
    const app = express();
    app.use(express.json());

    const embeddingController = new EmbeddingController(this.repository!);
    app.use("/api", embeddingController.getRouter());

    const PORT = process.env.PORT || 8081;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  }

  async s1() {
    await startAndWaitAsync();
    this.repository = this.repository || InitDb();

    await this.all();
  }

  async filex() {
    this.repository = this.repository || InitDb();

    let users = await this.repository.findAllUsers();

    for (const user of users) {
      console.log(`User: ${user.name}`);
      let deepseek = new Deepseek(user.credentials as credentials);
      // await this.fetch_User(user, true);
      await this.FilesUser(user, deepseek);
    }
  }

  async all() {
    if (!this.repository) {
      console.error("null repository");
      return;
    }
    let users = await this.repository.findAllUsers();
    for (const user of users) {
      await this.User_all(user, true);
    }
  }

  async User_all(user: User, all: boolean) {
    if (!this.repository) {
      console.error("null repository");
      return;
    }

    console.log(`User: ${user.name}`);

    let deepseek = new Deepseek(user.credentials as credentials);
    await this.FetchUser(all, deepseek, user);
    await this.FilesUser(user, deepseek);
  }

  private async FilesUser(user: User, deepseek: Deepseek) {
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

    const batchSize = 30;

    console.log(`Файлов для скачевания ${files.length} будет скачено ${Math.min(files.length, batchSize)}`);

    files = files.slice(0, batchSize);

    let filesAs = files
      .map(async (file) => {
        let text = await deepseek.file(file.id, file.sessionId, file.messageId);
        return new MessageFile({ ...file, content: text });
      })
      .map((f) =>
        f.catch((err) => {
          console.error(err);
          return null;
        }),
      );

    files = (await Promise.all(filesAs)).filter((a) => a != null);

    console.log(`Успешно скачено ${files.length}`);

    await this.repository!.createManyFiles(files);
  }

  private async FetchUser(all: boolean, deepseek: Deepseek, user: User) {
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

    try {
      for (const s of sessions_for_update) {
        let session = s.db_session ?? s.in_session;
        console.log(
          `Обновление: ${s.db_session == null ? "новый" : `(${dateStr(s.db_session.updated_at)})->(${dateStr(s.in_session.updated_at)}) `} [${session.title}]`,
        );

        let his = await deepseek.history_messages(session.id, session.version);

        await this.repository.createMessagesBizData(user.id, his);
      }
    } catch (error) {
      console.error(error);
    }
  }

  main() {
    this.start().catch(console.error);
  }

  constructor() {}
}

const greet = (name: string): void => {
  console.log(`Hello, ${name}!`);
};

greet("TypeScript");

let program = new Program();
program.main();
