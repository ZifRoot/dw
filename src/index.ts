import { InitDb } from "./db/Initdb";
import { startAndWaitAsync } from "./db/db-manager";
import { IRepository } from "./db/IRepository";

import { credentials, Deepseek } from "./deepseek";
import { ChatSessions } from "./db/models/ChatSessions";
import { ChatSessionBase, MessagesBizData } from "./db/resp";
import { ChatSessionsCreate } from "./db/models/ChatSessionsCreate";
import { User } from "./db/models/User";
import { dateStr } from "./utils/data-utils";

class Program {
  repository?: IRepository;

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
    var fetch_page = await deepseek.fetch_page_all();
    var first_page = fetch_page.at(-1);
    console.log(`Page: ${first_page?.title} ${dateStr(first_page?.updated_at)}`);

    var sessions = await this.repository.findAllSessions(user.id);

    const map_sessions = new Map(sessions.map((obj) => [obj.id!, obj]));

    var in_sessions = fetch_page.map((s) => new ChatSessions({ ...s, user_id: user.id }));

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
          `Обновление: ${s.db_session == null ? "новый" : `(${dateStr(s.db_session.updated_at)})->(${dateStr(s.in_session.updated_at)}) `} [${session.title}]`,
        );

        var his = await deepseek.history_messages(session.id, session.version);

        await this.repository.createMessagesBizData(user.id, his.data.biz_data);
      }
    } catch (error) {
      console.error(error);
    }
  }

  main() {
    this.start().catch(console.error);
  }

  constructor() {
  }
}

const greet = (name: string): void => {
  console.log(`Hello, ${name}!`);
};

greet("TypeScript");

let program = new Program();
program.main();
