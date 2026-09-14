"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatSessions = void 0;
const date_utils_1 = require("../../shared/utils/date-utils");
class ChatSessions {
    constructor(data) {
        this.id = data.id;
        this.title = data.title;
        this.title_type = data.title_type;
        this.pinned = data.pinned ?? false;
        this.updated_at = (0, date_utils_1.toDate)(data.updated_at);
        this.user_id = data.user_id;
        if (isFull(data)) {
            if (data.seq_id != null)
                this.seq_id = data.seq_id;
            if (data.agent != null)
                this.agent = data.agent;
            if (data.version != null)
                this.version = data.version;
            if (data.current_message_id != null)
                this.current_message_id = data.current_message_id;
            if (data.inserted_at != null)
                this.inserted_at = (0, date_utils_1.toDate)(data.inserted_at);
        }
    }
}
exports.ChatSessions = ChatSessions;
function isFull(data) {
    const fullKeys = ["version"];
    return fullKeys.every((key) => key in data);
}
