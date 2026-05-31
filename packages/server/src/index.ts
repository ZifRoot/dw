import { Program } from "./program";

Main();

function Main() {
  MainAsync().catch(console.error);
}

async function MainAsync() {
  let program = new Program();
  await program.start();
}
