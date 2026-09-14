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
exports.EmbedderLmStudio = void 0;
const node_http_1 = __importDefault(require("node:http"));
const logger_1 = require("./shared/utils/logger");
const single_runner_1 = require("./shared/utils/single-runner");
class EmbedderLmStudio {
    constructor(repository, baseUrl = "http://localhost:1234") {
        this.availableEmbeddingModels = null;
        this.repository = repository;
        this.baseUrl = baseUrl;
        this.httpAgent = new node_http_1.default.Agent({
            keepAlive: true,
            maxSockets: 50,
            maxFreeSockets: 10,
            timeout: 60000,
            keepAliveMsecs: 1000,
        });
    }
    async getAvailableEmbeddingModels() {
        if (this.availableEmbeddingModels !== null) {
            return this.availableEmbeddingModels;
        }
        const url = `${this.baseUrl}/api/v1/models`;
        try {
            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`LM Studio API error: ${response.status} ${errorText}`);
            }
            const data = await response.json();
            if (!data.models || !Array.isArray(data.models)) {
                throw new Error("Invalid response from LM Studio: no models data");
            }
            this.availableEmbeddingModels = data.models.filter(model => model.type === "embedding");
            console.log(`Доступные embedding модели LM Studio: ${this.availableEmbeddingModels.map(m => m.key).join(", ")}`);
            return this.availableEmbeddingModels;
        }
        catch (error) {
            console.error(`Ошибка получения списка моделей LM Studio: ${error}`);
            throw error;
        }
    }
    resetModelsCache() {
        this.availableEmbeddingModels = null;
    }
    async Update() {
        await this.processPendingEmbeddings();
    }
    async processPendingEmbeddings() {
        const availableModels = await this.getAvailableEmbeddingModels();
        if (availableModels.length === 0) {
            console.warn("LM Studio не имеет доступных embedding-моделей");
            return;
        }
        const prioritizedModels = this.prioritizeModels(availableModels);
        const sessions = await this.getAllSessionsWithPendingEmbeddings();
        for (const session of sessions) {
            await this.processSessionWithModels(session, prioritizedModels);
        }
    }
    async getAllSessionsWithPendingEmbeddings() {
        const users = await this.repository.findAllUsers();
        const allSessions = [];
        for (const user of users) {
            const sessions = await this.repository.findAllSessions(user.id);
            for (const session of sessions) {
                allSessions.push({ id: session.id, user_id: user.id });
            }
        }
        return allSessions;
    }
    prioritizeModels(models) {
        return [...models].sort((a, b) => {
            const aLoaded = (a.loaded_instances?.length ?? 0) > 0 ? 1 : 0;
            const bLoaded = (b.loaded_instances?.length ?? 0) > 0 ? 1 : 0;
            return bLoaded - aLoaded;
        });
    }
    async processSessionWithModels(session, models) {
        const fragments = await this.repository.findAllFragments(session.id);
        const responseFragments = fragments.filter((f) => f.type === "RESPONSE");
        if (responseFragments.length === 0) {
            return;
        }
        const combinedText = responseFragments.map((f) => f.content).join("\n\n");
        for (const model of models) {
            const modelName = this.getModelIdentifier(model);
            const existingEmbedding = await this.repository.findEmbeddingBySessionAndModel(session.id, modelName);
            if (existingEmbedding !== null) {
                continue;
            }
            const startTime = Date.now();
            const embedding = await this.getEmbedding(combinedText, modelName);
            const processingTime = Date.now() - startTime;
            await this.repository.createEmbedding(session.id, {
                model_name: modelName,
                dimension: embedding.length,
                embedding: embedding,
                createdAt: new Date(),
                sessionId: session.id,
                processing_time_ms: processingTime,
            });
            console.log(`Обработан эмбеддинг для сессии ${session.id}, модель: ${modelName}, размер: ${embedding.length}`);
        }
    }
    getModelIdentifier(model) {
        if (model.loaded_instances && model.loaded_instances.length > 0) {
            const instance = model.loaded_instances[0];
            if (instance.identifier) {
                return instance.identifier;
            }
        }
        return model.key;
    }
    async processSessionEmbedding(session) {
        const availableModels = await this.getAvailableEmbeddingModels();
        await this.processSessionWithModels(session, availableModels);
    }
    async getEmbedding(text, modelName) {
        const url = `${this.baseUrl}/v1/embeddings`;
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                input: text,
                model: modelName,
            }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`LM Studio API error: ${response.status} ${errorText}`);
        }
        const data = await response.json();
        if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
            throw new Error("Invalid response from LM Studio: no embedding data");
        }
        return data.data[0].embedding;
    }
}
exports.EmbedderLmStudio = EmbedderLmStudio;
__decorate([
    logger_1.LogSafe,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], EmbedderLmStudio.prototype, "Update", null);
__decorate([
    single_runner_1.SingleExecution,
    logger_1.LogSafe,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], EmbedderLmStudio.prototype, "processPendingEmbeddings", null);
