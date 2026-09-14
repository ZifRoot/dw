"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageFragment = void 0;
class MessageFragment {
    constructor(data) {
        this.sessionId = data.sessionId;
        this.messageId = data.messageId;
        this.fragmentOrder = data.id;
        this.type = data.type;
        this.content = data.content ?? "";
        this.elapsed_secs = data.elapsed_secs ?? null;
        this.references = data.references ?? null;
        this.stage_id = data.stage_id ?? null;
        this.size = data.size ?? data.content?.length ?? 0;
    }
}
exports.MessageFragment = MessageFragment;
