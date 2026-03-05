import { X } from "./x";

const greet = (name: string): void => {
  console.log(`Hello, ${name}!`);
};

greet("TypeScript");

let x = new X();
x.start().catch(console.error);
