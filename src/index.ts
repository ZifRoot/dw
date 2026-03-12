import { InitDb } from "./db/Initdb";
import { startAndWaitAsync } from "./db/db-manager";
import { IRepository } from "./db/IRepository";

import { Deepseek } from "./deepseek";
import { ChatSessions } from "./db/models/ChatSessions";
import { MessagesBizData } from "./db/resp";
import { ChatSessionsCreate } from "./db/models/ChatSessionsCreate";

class Program {
  deepseek: Deepseek;
  repository?: IRepository;
  format: Intl.DateTimeFormatOptions;

  async start() {
    //await this.deepseek.start();
    if (true) {
      await startAndWaitAsync();
      this.repository = InitDb();

      await this.SoftUpdate();
    }
  }

  private async SoftUpdate() {
    if (!this.repository) {
      console.error("null repository");
      return;
    }
    var fetch_page = await this.deepseek.fetch_page();

    var sessions = await this.repository.findAllSessions();

    const map_sessions = new Map(sessions.map((obj) => [obj.id!, obj]));

    var in_sessions = fetch_page.data.biz_data.chat_sessions.map((s) => new ChatSessions(s));

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

        var his = await this.deepseek.history_messages(session.id, session.version);

        await this.saveMessagesBizData(his.data.biz_data);
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
  async saveMessagesBizData(data: MessagesBizData): Promise<void> {
    if (!this.repository) {
      console.error("null repository");
      return;
    }
    const { chat_session, chat_messages } = data;

    // Сохраняем сессию (полная версия)
    const sessionData: ChatSessionsCreate = {
      id: chat_session.id,
      title: chat_session.title,
      title_type: chat_session.title_type,
      pinned: chat_session.pinned,
      updated_at: chat_session.updated_at,
      seq_id: chat_session.seq_id,
      agent: chat_session.agent,
      version: chat_session.version,
      current_message_id: chat_session.current_message_id,
      inserted_at: chat_session.inserted_at,
    };
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
    this.deepseek = new Deepseek();
    //"cosHuyThAgDzXXU0vhTX+SIVi+ByZGga/6NYpS8tu1pht4dwMnfjtOipq088NJsb"
  }
}

const greet = (name: string): void => {
  console.log(`Hello, ${name}!`);
};

greet("TypeScript");

let program = new Program();
program.main();
