import { InitDb } from "./db/Initdb";
import { runWithAppLifecycleAsync, startAndWaitAsync } from "./db/db-manager";
import { IRepository } from "./db/IRepository";

import { Deepseek } from "./deepseek";
import { ChatSessionFull } from "./db/resp";

class Program {
  deepseek: Deepseek;
  repository?: IRepository;

  async start() {
    //await this.deepseek.start();
    if (true) {
      await startAndWaitAsync();
      this.repository = InitDb();

      var sessions = await this.repository.findAllSessions();

      var sessions = sessions.filter((s) => s.version == null);
      sessions.sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());

      var session = sessions[0];

      var his = await this.deepseek.history_messages(session.id!);

      await this.deepseek.saveMessagesBizData(this.repository, his.data.biz_data);

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
    this.deepseek = new Deepseek();
  }
}

const greet = (name: string): void => {
  console.log(`Hello, ${name}!`);
};

greet("TypeScript");

let program = new Program();
program.main();
