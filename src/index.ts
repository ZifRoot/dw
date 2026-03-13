import { InitDb } from "./db/Initdb";
import { startAndWaitAsync } from "./db/db-manager";
import { IRepository } from "./db/IRepository";

import { credentials, Deepseek } from "./deepseek";
import { ChatSessions } from "./db/models/ChatSessions";
import { MessagesBizData } from "./db/resp";
import { ChatSessionsCreate } from "./db/models/ChatSessionsCreate";
import { User } from "./db/models/User";

class Program {
  repository?: IRepository;
  format: Intl.DateTimeFormatOptions;

  async start() {
    //await this.deepseek.start();

    //await startAndWaitAsync();
    this.repository = InitDb();

    var users = await this.repository.findAllUsers();
    for (const user of users) {
      await this.SoftUpdate(user);
    }

    console.log("DONE");
    //await this.SoftUpdate();
  }

  async SoftUpdate(user: User) {
    if (!this.repository) {
      console.error("null repository");
      return;
    }

    console.log(`User: ${user.name}`);

    var deepseek = new Deepseek(user.credentials as credentials);
    var fetch_page = await deepseek.fetch_page();

    var sessions = await this.repository.findAllSessions(user.id);

    const map_sessions = new Map(sessions.map((obj) => [obj.id!, obj]));

    var in_sessions = fetch_page.data.biz_data.chat_sessions.map((s) => new ChatSessions({ ...s, user_id: user.id }));

    var sessions_for_update = in_sessions
      .map((in_session) => ({ in_session: in_session, db_session: map_sessions.get(in_session.id) }))
      .filter((s) => {
        if (s.db_session == null) return true;
        var date1 = s.db_session.updated_at;
        var date2 = s.in_session.updated_at;

        const sec1 = date1.getTime() / 1000;
        const sec2 = date2.getTime() / 1000;

        const diff = Math.abs(sec1 - sec2) > 1;

        return diff;
      });

    try {
      for (const s of sessions_for_update) {
        var session = s.db_session ?? s.in_session;
        console.log(
          `Обновление: ${s.db_session == null ? "новый" : `(${s.db_session.updated_at.toLocaleString("ru-RU", this.format)})->(${s.in_session.updated_at.toLocaleString("ru-RU", this.format)}) `} [${session.title}]`,
        );

        var his = await deepseek.history_messages(session.id, session.version);

        await this.saveMessagesBizData(user.id, his.data.biz_data);
      }
    } catch (error) {
      console.error(error);
    }
  }

  /**
   * Сохраняет полные данные сессии и всех её сообщений в репозиторий.
   * @param repo - экземпляр DrizzleRepository
   * @param data - объект MessagesBizData из API
   */
  async saveMessagesBizData(user_id: string, data: MessagesBizData): Promise<void> {
    if (!this.repository) {
      console.error("null repository");
      return;
    }
    const { chat_session, chat_messages } = data;

    // Сохраняем сессию (полная версия)
    const sessionData: ChatSessionsCreate = { ...chat_session, user_id };
    await this.repository.createSession(sessionData);

    // Сохраняем сообщения (sessionId передаётся отдельно)
    await this.repository.createManyMessages(
      chat_session.id,
      chat_messages.map((m) => ({ ...m, sessionId: chat_session.id })),
    );
  }

  main() {
    this.start().catch(console.error);
  }

  constructor() {
    this.format = {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };
    //this.deepseek = new Deepseek();
    //"cosHuyThAgDzXXU0vhTX+SIVi+ByZGga/6NYpS8tu1pht4dwMnfjtOipq088NJsb"
  }
}

const greet = (name: string): void => {
  console.log(`Hello, ${name}!`);
};

greet("TypeScript");

let program = new Program();
program.main();
