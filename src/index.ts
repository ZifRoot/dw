import { runWithAppLifecycleAsync } from "./db/db-manager";
import { Deepseek } from "./deepseek";

class Program {
  deepseek: Deepseek;

  async start() {
    //await this.deepseek.start();
    await runWithAppLifecycleAsync();
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
