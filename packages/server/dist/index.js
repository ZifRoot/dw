"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const program_1 = require("./program");
Main();
function Main() {
    MainAsync().catch(console.error);
}
async function MainAsync() {
    let program = new program_1.Program();
    await program.start();
}
