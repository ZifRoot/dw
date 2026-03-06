import { randomUUID } from "crypto";
import { InitDb } from "./db/Initdb";
import { runWithAppLifecycleAsync } from "./db/db-manager";
import { IItemRepository } from "./db/IItemRepository";
import { ApiResponse, chat_sessions } from "./db/models/chat_sessions";
import { Deepseek } from "./deepseek";

class Program {
  deepseek: Deepseek;
  repository?: IItemRepository;

  async start() {
    await this.deepseek.start();
    if (false) {
      await runWithAppLifecycleAsync();
      this.repository = InitDb();

      // await this.repository.create({ id: '46086758-631f-4413-8e27-c1392c0954db', title: "---3463456---456", title_type: "fg", updated_at: 5, pinned: false });
      let updated_at: number | null = null;
      while (true) {
        let fetchpage = await this.deepseek.fetch_page(updated_at);
        let ud0 = fetchpage.data.biz_data.chat_sessions[0].updated_at;
        let ude = fetchpage.data.biz_data.chat_sessions.at(-1)?.updated_at;
        let has_more = fetchpage.data.biz_data.has_more;
        console.log(`0:updated_at = ${ud0} | END:updated_at = ${ude} | has_more = ${has_more}`);

        let num = await this.repository!.createMany(fetchpage.data.biz_data.chat_sessions);
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
