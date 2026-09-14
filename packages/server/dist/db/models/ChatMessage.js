"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatMessage = void 0;
const date_utils_1 = require("../../shared/utils/date-utils");
const MessageFragment_1 = require("./MessageFragment");
class ChatMessage {
    constructor(data) {
        this.sessionId = data.sessionId;
        this.messageId = data.message_id;
        this.parentMessageId = data.parent_id ?? null;
        this.model = data.model ?? null;
        this.role = data.role;
        this.thinkingEnabled = data.thinking_enabled;
        this.banEdit = data.ban_edit;
        this.banRegenerate = data.ban_regenerate;
        this.status = data.status;
        this.accumulatedTokenUsage = data.accumulated_token_usage;
        this.feedback = data.feedback ?? null;
        this.insertedAt = (0, date_utils_1.toDate)(data.inserted_at);
        this.searchEnabled = data.search_enabled;
        this.hasPendingFragment = data.has_pending_fragment;
        this.autoContinue = data.auto_continue;
        this.fragments = data.fragments.map((f) => new MessageFragment_1.MessageFragment({ ...f, messageId: data.message_id, sessionId: data.sessionId }));
    }
}
exports.ChatMessage = ChatMessage;
