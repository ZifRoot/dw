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
    await runWithAppLifecycleAsync();
    this.repository = InitDb();

    // await this.repository.create({ id: '46086758-631f-4413-8e27-c1392c0954db', title: "---3463456---456", title_type: "fg", updated_at: 5, pinned: false });

    //var fetchpage = await this.deepseek.fetch_page();
    var fetchpage = require("../fetch_page.json") as ApiResponse;

    // var fetchpage = rsp.data.biz_data.chat_sessions.slice(0, 1);

    var num = await this.repository.createMany(fetchpage.data.biz_data.chat_sessions);
    console.log(`Created ${num}`);
    //await this.deepseek.start();
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
