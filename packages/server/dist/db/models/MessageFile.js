"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageFile = void 0;
const date_utils_1 = require("../../shared/utils/date-utils");
const uuid_1 = require("../../shared/utils/uuid");
class MessageFile {
    constructor(data) {
        this.id = (0, uuid_1.normalizeUUID)(data.id) ?? crypto.randomUUID();
        this.sessionId = data.sessionId;
        this.messageId = data.messageId;
        this.status = data.status;
        this.file_name = data.file_name;
        this.previewable = data.previewable;
        this.file_size = data.file_size;
        this.token_usage = data.token_usage;
        this.error_code = data.error_code ?? null;
        this.inserted_at = (0, date_utils_1.toDate)(data.inserted_at);
        this.updated_at = (0, date_utils_1.toDate)(data.updated_at);
        if (data.content == null) {
            this.content = null;
            this.contentBytes = null;
            return;
        }
        if (typeof data.content === "string") {
            const hex = data.content.startsWith("0x") ? data.content.slice(2) : data.content;
            const buffer = Buffer.from(hex, "hex");
            this.content = hex;
            this.contentBytes = buffer;
            return;
        }
        if (Buffer.isBuffer(data.content)) {
            const hex = data.content.toString("hex");
            this.content = hex;
            this.contentBytes = data.content;
            return;
        }
        if (data.content instanceof ArrayBuffer) {
            const buffer = Buffer.from(data.content);
            this.content = buffer.toString("hex");
            this.contentBytes = buffer;
            return;
        }
        this.content = null;
        this.contentBytes = null;
    }
}
exports.MessageFile = MessageFile;
