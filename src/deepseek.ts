import { ChatSessionBase, FileResponse, MessagesResponse, SessionsResponse } from "./db/resp";
import { getHighResTime } from "./utils/data-utils";
import { Throttler } from "./utils/throttler";
import { ThrottledMethod, InjectThrottle } from "./utils/throttler-decorators";

let throttler = new Throttler(500, 800);

@InjectThrottle(throttler)
export class Deepseek {
  headers: Headers;

  async fetch_page_all(): Promise<ChatSessionBase[]> {
    let updated_at: number | null = null;
    var chat_sessions_all: ChatSessionBase[] = [];
    while (true) {
      let fetchpage = await this.fetch_page(updated_at);
      var chat_sessions = fetchpage.chat_sessions;
      let ud0 = chat_sessions[0].updated_at;
      let ude = chat_sessions.at(-1)?.updated_at;
      let has_more = fetchpage.has_more;
      chat_sessions_all.push(...chat_sessions);

      if (!has_more) break;
      updated_at = ude!;
    }
    return chat_sessions_all;
  }

  async fetch_page(updated_at?: number | null) {
    return (await this.fetch_page_raw(updated_at)).data.biz_data;
  }

  async history_messages(chat_session_id: string, version?: number) {
    return (await this.history_messages_raw(chat_session_id, version)).data.biz_data;
  }

  async file_preview(file_id: string, chat_session_id: string, message_id: string | number) {
    return (await this.file_preview_raw(file_id, chat_session_id, message_id)).data.biz_data;
  }

  async file(file_id: string, chat_session_id: string, message_id: string | number) {
    var resp = await this.file_resp(file_id, chat_session_id, message_id);

    var text = await resp.arrayBuffer();
    return text;
  }

  async fetch_page_raw(updated_at?: number | null) {
    let resp = await this.fetch_page_resp(updated_at);

    let fetchpage = (await resp.json()) as SessionsResponse;
    return fetchpage;
  }

  async history_messages_raw(chat_session_id: string, version?: number) {
    let resp = await this.history_messages_resp(chat_session_id, version ?? null);

    let fetchpage = (await resp.json()) as MessagesResponse;
    return fetchpage;
  }

  async file_preview_raw(file_id: string, chat_session_id: string, message_id: string | number) {
    let resp = await this.file_preview_resp(file_id, chat_session_id, message_id);

    let fetchpage = (await resp.json()) as FileResponse;
    return fetchpage;
  }

  async fetch_page_resp(updated_at?: number | null) {
    //https://chat.deepseek.com/api/v0/chat_session/fetch_page?lte_cursor.pinned=false&lte_cursor.updated_at=1770623753.319

    let url = new URL("https://chat.deepseek.com/api/v0/chat_session/fetch_page");
    if (updated_at != null) {
      url.searchParams.append("lte_cursor.updated_at", updated_at.toString());
      url.searchParams.append("lte_cursor.pinned", "false");
    }
    let str = url.toString();

    return await this.GET(str);
  }

  async history_messages_resp(chat_session_id: string, version: number | null) {
    let url = new URL("https://chat.deepseek.com/api/v0/chat/history_messages");
    url.searchParams.append("chat_session_id", chat_session_id);
    if (version != null) {
      url.searchParams.append("cache_version", `${version}`);
    }

    let str = url.toString();

    return await this.GET(str);
  }

  async file_preview_resp(file_id: string, chat_session_id: string, message_id: string | number) {
    if (!file_id.startsWith("file-")) {
      file_id = `file-${file_id}`;
    }

    let url = new URL("https://chat.deepseek.com/api/v0/file/preview");
    url.searchParams.append("file_id", file_id);
    url.searchParams.append("chat_session_id", chat_session_id);
    url.searchParams.append("message_id", `${message_id}`);

    let str = url.toString();
    return await this.GET(str);
  }

  async file_resp(file_id: string, chat_session_id: string, message_id: string | number) {
    var url = (await this.file_preview(file_id, chat_session_id, message_id)).url;

    return await this.GET(url);
  }

  @ThrottledMethod
  async GET(url: string) {
    console.log(`${getHighResTime()} | ${url} `);
    return await fetch(url, { headers: this.headers, body: null, method: "GET" });
  }

  constructor(user: credentials) {
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
}

export type credentials = { authorization: string; cookie: string };

type Headers = {
  accept: string;
  "accept-language": string;
  authorization?: string;
  priority: string;
  "sec-ch-ua": string;
  "sec-ch-ua-arch": string;
  "sec-ch-ua-bitness": string;
  "sec-ch-ua-full-version": string;
  "sec-ch-ua-full-version-list": string;
  "sec-ch-ua-mobile": string;
  "sec-ch-ua-model": string;
  "sec-ch-ua-platform": string;
  "sec-ch-ua-platform-version": string;
  "sec-fetch-dest": string;
  "sec-fetch-mode": string;
  "sec-fetch-site": string;
  "x-app-version": string;
  "x-client-locale": string;
  "x-client-platform": string;
  "x-client-timezone-offset": string;
  "x-client-version": string;
  cookie?: string;
};
