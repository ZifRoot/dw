import { testDb1 } from "./db/app";
import { runWithAppLifecycleAsync } from "./db/db-manager";
import { Deepseek } from "./deepseek";

class Program {
  deepseek: Deepseek;

  async start() {
    await runWithAppLifecycleAsync();

    await testDb1();

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
