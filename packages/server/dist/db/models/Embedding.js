"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Embedding = void 0;
const date_utils_1 = require("../../shared/utils/date-utils");
class Embedding {
    constructor(data) {
        this.sessionId = data.sessionId;
        this.model_name = data.model_name;
        this.createdAt = data.createdAt ? (0, date_utils_1.toDate)(data.createdAt) : new Date();
        this.dimension = data.dimension ?? 0;
        this.processing_time_ms = data.processing_time_ms;
        this.embedding = null;
        if (Array.isArray(data.embedding)) {
            this.embedding = data.embedding.map((a) => +a);
        }
    }
}
exports.Embedding = Embedding;
