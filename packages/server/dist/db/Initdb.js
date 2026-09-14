"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InitdrizzleDb = InitdrizzleDb;
exports.InitDb = InitDb;
exports.InitDbFast = InitDbFast;
exports.InitDbAsync = InitDbAsync;
require("dotenv/config");
const DrizzleRepository_1 = require("./DrizzleRepository");
const drizzle_db_1 = require("./drizzle/drizzle-db");
const db_manager_1 = require("./db-manager");
function InitdrizzleDb() {
    return new DrizzleRepository_1.DrizzleRepository(drizzle_db_1.db_drizzle);
}
function InitDb() {
    if (!db_manager_1.DbManager.startAndWaitSync())
        return null;
    return InitdrizzleDb();
}
function InitDbFast() {
    return InitdrizzleDb();
}
async function InitDbAsync() {
    if (!(await db_manager_1.DbManager.startAndWaitAsync()))
        return null;
    return InitdrizzleDb();
}
