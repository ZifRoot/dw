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
exports.Embedder = void 0;
const node_http_1 = __importDefault(require("node:http"));
const _embedder_1 = require("./clients/embedder/axios");
const data_utils_1 = require("./shared/utils/data-utils");
const logger_1 = require("./shared/utils/logger");
const single_runner_1 = require("./shared/utils/single-runner");
const vector_1 = require("./shared/utils/vector");
class Embedder {
    constructor(repository) {
        this.repository = repository;
        this.tasks = new Map();
        this.sessionTaskMap = new Map();
        this.httpAgent = new node_http_1.default.Agent({
            keepAlive: true,
            maxSockets: 50,
            maxFreeSockets: 10,
            timeout: 60000,
            keepAliveMsecs: 1000,
        });
        const config = new _embedder_1.Configuration({
            basePath: "http://localhost:8000",
            baseOptions: { httpAgent: this.httpAgent },
        });
        this.modelApi = new _embedder_1.ModelsApi(config);
        this.embeddingsApi = new _embedder_1.EmbeddingsApi(config);
    }
    async Update() {
        await this.CreateTasks();
        await this.workEmbedding();
    }
    async CreateTasks() {
        const modelNames = await this.getAvailableModelNames();
        const descriptors = await this.collectMissingTaskDescriptors(modelNames);
        const createdTasks = await this.createTasksForDescriptors(descriptors);
        this.storeCreatedTasks(createdTasks);
    }
    async getAvailableModelNames() {
        const response = await this.modelApi.getModelsModelsGet();
        return response.data.models.map((model) => model.name);
    }
    async collectMissingTaskDescriptors(modelNames) {
        const users = await this.repository.findAllUsers();
        const userTasks = await Promise.all(users.map((user) => this.getMissingTasksForUser(user.id, modelNames)));
        return userTasks.flat();
    }
    async getMissingTasksForUser(userId, modelNames) {
        const sessions = await this.repository.findAllSessions(userId);
        const sessionTasks = await Promise.all(sessions.map((session) => this.getMissingTasksForSession(session.id, modelNames)));
        return sessionTasks.flat();
    }
    async getMissingTasksForSession(sessionId, modelNames) {
        const existing = await this.repository.findEmbeddingsBySession(sessionId);
        const existingModels = existing.map((emb) => emb.model_name);
        const pendingModels = (this.sessionTaskMap.get(sessionId) ?? []).map((t) => t.modelName);
        const missingModels = (0, data_utils_1.subtractSets)((0, data_utils_1.subtractSets)(modelNames, existingModels), pendingModels);
        return missingModels.map((model) => ({ model_name: model, sessionId }));
    }
    async expandDescriptorsToFragmentTasks(descriptors) {
        const expanded = await Promise.all(descriptors.map((desc) => this.expandOneDescriptor(desc)));
        return expanded.flat();
    }
    async expandOneDescriptor(desc) {
        const fragments = await this.repository.findAllFragments(desc.sessionId);
        const contents = fragments.filter((f) => f.type === "RESPONSE").map((f) => f.content);
        return contents.map((content) => ({
            model_name: desc.model_name,
            sessionId: desc.sessionId,
            text: content,
        }));
    }
    async createTasksForDescriptors(descriptors) {
        let fragmentTasks = await this.expandDescriptorsToFragmentTasks(descriptors);
        fragmentTasks.sort((a, b) => a.model_name.localeCompare(b.model_name) || a.sessionId.localeCompare(b.sessionId));
        let createdTasks = [];
        for (const ft of fragmentTasks) {
            const apiTask = await this.embeddingsApi.createTaskEmbeddingsPost({
                model_name: ft.model_name,
                text: ft.text,
            });
            createdTasks.push({
                taskId: apiTask.data.task_id,
                contentLength: ft.text.length,
                sessionId: ft.sessionId,
                modelName: ft.model_name,
            });
        }
        return createdTasks;
    }
    storeCreatedTasks(tasks) {
        for (const task of tasks) {
            this.tasks.set(task.taskId, task);
            const sessionTasks = this.sessionTaskMap.get(task.sessionId) ?? [];
            sessionTasks.push(task);
            this.sessionTaskMap.set(task.sessionId, sessionTasks);
        }
    }
    async workEmbedding() {
        while (this.tasks.size > 0) {
            const stepPerformed = await this.workEmbeddingStep();
            if (!stepPerformed)
                await (0, data_utils_1.delay)(2000);
        }
    }
    async workEmbeddingStep() {
        const completed = (await this.embeddingsApi.listTasksEmbeddingsGet("completed")).data.tasks;
        if (completed.length === 0)
            return false;
        for (const task of completed)
            await this.workTask(task);
        return true;
    }
    async workTask(completedTask) {
        const localTask = await this.tryGetLocalTask(completedTask.task_id);
        if (!localTask)
            return;
        await this.processCompletedTask(localTask);
    }
    async tryGetLocalTask(taskId) {
        const localTask = this.tasks.get(taskId);
        if (!localTask) {
            console.log("task miss");
            await this.embeddingsApi.deleteTaskEmbeddingsTaskIdDelete(taskId);
            return null;
        }
        this.tasks.delete(taskId);
        return localTask;
    }
    async processCompletedTask(localTask) {
        const sessionTasks = this.sessionTaskMap.get(localTask.sessionId);
        if (!sessionTasks) {
            console.log("session miss");
            return;
        }
        const fullTask = await this.fetchAndDeleteRemoteTask(localTask.taskId);
        this.updateLocalTaskWithResult(localTask, fullTask);
        this.checkAndFinalizeSession(localTask.sessionId, sessionTasks);
    }
    async fetchAndDeleteRemoteTask(taskId) {
        const task = await this.embeddingsApi.getTaskEmbeddingsTaskIdGet(taskId);
        await this.embeddingsApi.deleteTaskEmbeddingsTaskIdDelete(taskId);
        return task.data;
    }
    updateLocalTaskWithResult(localTask, apiTask) {
        localTask.result = apiTask.result;
        localTask.processing_time_ms = apiTask.processing_time_ms ?? undefined;
    }
    checkAndFinalizeSession(sessionId, sessionTasks) {
        const completedCount = sessionTasks.filter((t) => t.result !== undefined).length;
        console.log(`${completedCount}/${sessionTasks.length}`);
        if (completedCount === sessionTasks.length) {
            this.aggregateAndSaveEmbedding(sessionId, sessionTasks);
            this.sessionTaskMap.delete(sessionId);
        }
    }
    async aggregateAndSaveEmbedding(sessionId, tasks) {
        const embedding = this.computeAggregatedEmbedding(tasks);
        const totalTime = tasks.reduce((sum, t) => sum + (t.processing_time_ms ?? 0), 0);
        await this.repository.createEmbedding(sessionId, {
            model_name: tasks[0].modelName,
            dimension: embedding.length,
            embedding: embedding,
            createdAt: new Date(),
            sessionId: sessionId,
            processing_time_ms: totalTime,
        });
    }
    computeAggregatedEmbedding(completed) {
        const weightedSum = completed.reduce((sum, t) => (0, vector_1.sumA)(sum, (0, vector_1.mult)(t.result.slice(), t.contentLength)), [0]);
        const totalLen = completed.reduce((sum, t) => sum + t.contentLength, 0);
        return (0, vector_1.div)(weightedSum, totalLen);
    }
}
exports.Embedder = Embedder;
__decorate([
    logger_1.LogSafe,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], Embedder.prototype, "Update", null);
__decorate([
    single_runner_1.SingleExecution,
    logger_1.LogSafe,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], Embedder.prototype, "CreateTasks", null);
__decorate([
    single_runner_1.SingleExecution,
    logger_1.LogSafe,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], Embedder.prototype, "workEmbedding", null);
__decorate([
    logger_1.LogSafe,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], Embedder.prototype, "workEmbeddingStep", null);
__decorate([
    logger_1.LogParamSafe,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], Embedder.prototype, "workTask", null);
