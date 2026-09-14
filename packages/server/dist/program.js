"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Program = void 0;
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const Initdb_1 = require("./db/Initdb");
const ChatSessions_1 = require("./db/models/ChatSessions");
const MessageFile_1 = require("./db/models/MessageFile");
const User_1 = require("./db/models/User");
const deepseek_1 = require("./deepseek");
const controllers_1 = require("./controllers");
const single_runner_1 = require("./shared/utils/single-runner");
const date_utils_1 = require("./shared/utils/date-utils");
const logger_1 = require("./shared/utils/logger");
const EmbedderLmStudio_1 = require("./EmbedderLmStudio");
class Program {
    async start() {
        await this.RepositoryAsync();
        this.embedder = new EmbedderLmStudio_1.EmbedderLmStudio(this.repo());
        const app = (0, express_1.default)();
        app.use(express_1.default.json());
        (0, controllers_1.createExpressApp)(this, app);
        let clientPath = path_1.default.join(process.cwd(), "..", "client", "dist");
        app.use(express_1.default.static(clientPath));
        const PORT = +(process.env.PORT || 8081);
        app.listen(PORT, "0.0.0.0", () => {
            console.log(`Server running http://localhost:${PORT}/ |`);
        });
    }
    async Update() {
        await this.ExecUsers();
    }
    async UpdateEmbedding() {
        await this.embedder.Update();
    }
    async ExecUsers() {
        await this.RepositoryAsync();
        if (!this.repository) {
            console.error("null repository");
            return;
        }
        let users = await this.repository.findAllUsers();
        await Promise.all(users.map((user) => this.ExecUser(user, false)));
    }
    async ExecUser(user, all) {
        if (!this.repository) {
            console.error("null repository");
            return;
        }
        console.log(`User: ${user.name}`);
        let deepseek = new deepseek_1.Deepseek(user.credentials);
        await this.FetchUser(deepseek, user, all);
        await this.FilesUser(deepseek, user);
    }
    async FilesUser(deepseek, user) {
        if (!this.repository) {
            console.error("null repository");
            return;
        }
        let map = new Map();
        let sessions = await this.repository.findAllSessions(user.id);
        let files_x = await Promise.all(sessions.map((session) => this.repository.findAllFilesNullContent(session.id)));
        let files = files_x.flat().uniqueBy((f) => f.id);
        files = files.filter((f) => f.content == null);
        console.log(`Файлов для скачевания ${files.length} будет скачено ${files.length}`);
        let filesAs = files.map((file) => this.file_1(deepseek, file));
        await Promise.all(filesAs);
    }
    async file_1(deepseek, file) {
        console.log(`Качаю ${file.file_name} | байт ${file.file_size}`);
        let text = await deepseek.file(file.id, file.sessionId, file.messageId);
        const mf = new MessageFile_1.MessageFile({ ...file, content: text });
        await this.repository.createManyFiles([mf]);
        console.log(`Успешно скачено ${file.file_name} | байт ${file.file_size}`);
        return mf;
    }
    async FetchUser(deepseek, user, all) {
        if (!this.repository) {
            console.error("null repository");
            return;
        }
        let fetch_page = all ? await deepseek.fetch_page_all() : (await deepseek.fetch_page()).chat_sessions;
        let first_page = fetch_page.at(-1);
        let sessions = await this.repository.findAllSessions(user.id);
        const map_sessions = new Map(sessions.map((obj) => [obj.id, obj]));
        let in_sessions = fetch_page.map((s) => new ChatSessions_1.ChatSessions({ ...s, user_id: user.id }));
        let sessions_for_update = in_sessions
            .map((in_session) => ({ in_session: in_session, db_session: map_sessions.get(in_session.id) }))
            .filter((s) => {
            if (s.db_session == null)
                return true;
            let date1 = s.db_session.updated_at;
            let date2 = s.in_session.updated_at;
            const sec1 = date1.getTime() / 1000;
            const sec2 = date2.getTime() / 1000;
            const diff = Math.abs(sec1 - sec2) > 1;
            return diff;
        });
        await Promise.all(sessions_for_update.map((s) => this.user_1(s, deepseek, user)));
    }
    async user_1(s, deepseek, user) {
        let session = s.db_session ?? s.in_session;
        console.log(`Обновление: ${s.db_session == null ? "новый" : `(${(0, date_utils_1.dateStr)(s.db_session.updated_at)})->(${(0, date_utils_1.dateStr)(s.in_session.updated_at)}) `} [${session.title}]`);
        let his = await deepseek.history_messages(session.id, session.version);
        await this.repository.createMessagesBizData(user.id, his);
    }
    Repository() {
        return (this.repository = this.repository || (0, Initdb_1.InitDb)());
    }
    async RepositoryAsync() {
        return (this.repository = this.repository || (await (0, Initdb_1.InitDbAsync)()));
    }
    constructor() { }
    repo() {
        return this.repository;
    }
}
exports.Program = Program;
__decorate([
    logger_1.LogSafe,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], Program.prototype, "Update", null);
__decorate([
    logger_1.LogSafe,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], Program.prototype, "UpdateEmbedding", null);
__decorate([
    single_runner_1.SingleExecution,
    logger_1.LogSafe,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], Program.prototype, "ExecUsers", null);
__decorate([
    logger_1.LogSafe,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [deepseek_1.Deepseek, User_1.User]),
    __metadata("design:returntype", Promise)
], Program.prototype, "FilesUser", null);
__decorate([
    logger_1.Safe,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [deepseek_1.Deepseek, MessageFile_1.MessageFile]),
    __metadata("design:returntype", Promise)
], Program.prototype, "file_1", null);
__decorate([
    logger_1.LogSafe,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [deepseek_1.Deepseek, User_1.User, Boolean]),
    __metadata("design:returntype", Promise)
], Program.prototype, "FetchUser", null);
__decorate([
    logger_1.Safe,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, deepseek_1.Deepseek, User_1.User]),
    __metadata("design:returntype", Promise)
], Program.prototype, "user_1", null);
__decorate([
    logger_1.LogSafe,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], Program.prototype, "Repository", null);
__decorate([
    logger_1.LogSafe,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], Program.prototype, "RepositoryAsync", null);
