import { InitDb } from "./db/Initdb";
import { runWithAppLifecycleAsync, startAndWaitAsync } from "./db/db-manager";
import { IRepository } from "./db/IRepository";

import { Deepseek } from "./deepseek";
import { ChatSessionFull } from "./db/resp";
import { ChatSessions } from "./db/models/ChatSessions";
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

      return;

      // await this.repository.create({ id: '46086758-631f-4413-8e27-c1392c0954db', title: "---3463456---456", title_type: "fg", updated_at: 5, pinned: false });
      let updated_at: number | null = null;
      while (true) {
        let fetchpage = await this.deepseek.fetch_page(updated_at);
        let ud0 = fetchpage.data.biz_data.chat_sessions[0].updated_at;
        let ude = fetchpage.data.biz_data.chat_sessions.at(-1)?.updated_at;
        let has_more = fetchpage.data.biz_data.has_more;
        console.log(`0:updated_at = ${ud0} | END:updated_at = ${ude} | has_more = ${has_more}`);

        let num = await this.repository!.createManySessions(fetchpage.data.biz_data.chat_sessions as ChatSessionFull[]);
        console.log(`Created ${num}`);

        if (!has_more) break;
        updated_at = ude!;
      }
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
