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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Deepseek = void 0;
const date_utils_1 = require("./shared/utils/date-utils");
const throttler_decorators_1 = require("./shared/utils/throttler-decorators");
let Deepseek = class Deepseek {
    async fetch_page_all() {
        let updated_at = null;
        var chat_sessions_all = [];
        while (true) {
            let fetchpage = await this.fetch_page(updated_at);
            var chat_sessions = fetchpage.chat_sessions;
            let ud0 = chat_sessions[0].updated_at;
            let ude = chat_sessions.at(-1)?.updated_at;
            let has_more = fetchpage.has_more;
            chat_sessions_all.push(...chat_sessions);
            if (!has_more)
                break;
            updated_at = ude;
        }
        return chat_sessions_all;
    }
    async fetch_page(updated_at) {
        const raw = await this.fetch_page_raw(updated_at);
        if (raw.code != 0) {
            throw new Error(raw.msg);
        }
        return raw.data.biz_data;
    }
    async history_messages(chat_session_id, version) {
        const raw = await this.history_messages_raw(chat_session_id, version);
        if (raw.code != 0) {
            throw new Error(raw.msg);
        }
        return raw.data.biz_data;
    }
    async file_preview(file_id, chat_session_id, message_id) {
        const raw = await this.file_preview_raw(file_id, chat_session_id, message_id);
        if (raw.code != 0) {
            throw new Error(raw.msg);
        }
        return raw.data.biz_data;
    }
    async file(file_id, chat_session_id, message_id) {
        var resp = await this.file_resp(file_id, chat_session_id, message_id);
        var text = await resp.arrayBuffer();
        return text;
    }
    async fetch_page_raw(updated_at) {
        let resp = await this.fetch_page_resp(updated_at);
        return (await resp.json());
    }
    async history_messages_raw(chat_session_id, version) {
        let resp = await this.history_messages_resp(chat_session_id, version ?? null);
        let fetchpage = (await resp.json());
        return fetchpage;
    }
    async file_preview_raw(file_id, chat_session_id, message_id) {
        let resp = await this.file_preview_resp(file_id, chat_session_id, message_id);
        let fetchpage = (await resp.json());
        return fetchpage;
    }
    async fetch_page_resp(updated_at) {
        let url = new URL("chat_session/fetch_page", this.baseUrl);
        if (updated_at != null) {
            url.searchParams.append("lte_cursor.updated_at", updated_at.toString());
            url.searchParams.append("lte_cursor.pinned", "false");
        }
        let str = url.toString();
        return await this.GET(str);
    }
    async history_messages_resp(chat_session_id, version) {
        let url = new URL("chat/history_messages", this.baseUrl);
        url.searchParams.append("chat_session_id", chat_session_id);
        if (version != null) {
            url.searchParams.append("cache_version", `${version}`);
        }
        let str = url.toString();
        return await this.GET(str);
    }
    async file_preview_resp(file_id, chat_session_id, message_id) {
        if (!file_id.startsWith("file-")) {
            file_id = `file-${file_id}`;
        }
        let url = new URL("file/preview", this.baseUrl);
        url.searchParams.append("file_id", file_id);
        url.searchParams.append("chat_session_id", chat_session_id);
        url.searchParams.append("message_id", `${message_id}`);
        let str = url.toString();
        return await this.GET(str);
    }
    async file_resp(file_id, chat_session_id, message_id) {
        var url = (await this.file_preview(file_id, chat_session_id, message_id)).url;
        return await this.GET(url);
    }
    async GET(url) {
        console.log(`${(0, date_utils_1.getHighResTime)()} | ${url} `);
        return await fetch(url, { headers: this.headers, body: null, method: "GET" });
    }
    constructor(user) {
        this.baseUrl = new URL("https://chat.deepseek.com/api/v0/");
        this.headers = {
            accept: "*/*",
            "accept-language": "ru,en-US;q=0.9,en;q=0.8",
            priority: "u=1, i",
            "sec-ch-ua": '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
            "sec-ch-ua-arch": '"x86"',
            "sec-ch-ua-bitness": '"64"',
            "sec-ch-ua-full-version": '"145.0.7632.159"',
            "sec-ch-ua-full-version-list": '"Not:A-Brand";v="99.0.0.0", "Google Chrome";v="145.0.7632.159", "Chromium";v="145.0.7632.159"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-model": '""',
            "sec-ch-ua-platform": '"Windows"',
            "sec-ch-ua-platform-version": '"19.0.0"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "x-app-version": "20241129.1",
            "x-client-locale": "ru",
            "x-client-platform": "web",
            "x-client-timezone-offset": "25200",
            "x-client-version": "1.7.0",
            ...user,
        };
    }
};
exports.Deepseek = Deepseek;
__decorate([
    throttler_decorators_1.ThrottledMethod,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], Deepseek.prototype, "GET", null);
exports.Deepseek = Deepseek = __decorate([
    (0, throttler_decorators_1.CreateThrottle)(100, 300),
    __metadata("design:paramtypes", [Object])
], Deepseek);
