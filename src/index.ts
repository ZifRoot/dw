import { InitDb } from "./db/Initdb";
import { startAndWaitAsync } from "./db/db-manager";
import { IRepository } from "./db/IRepository";

import { Deepseek } from "./deepseek";
import { ChatSessions } from "./db/models/ChatSessions";

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

        await this.deepseek.saveMessagesBizData(this.repository, his.data.biz_data);
      }
    } catch (error) {
      console.error(error);
    }
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
  }
}

const greet = (name: string): void => {
  console.log(`Hello, ${name}!`);
};

greet("TypeScript");

let program = new Program();
program.main();
