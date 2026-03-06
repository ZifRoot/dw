import * as fs from "fs";
import { ApiResponse } from "./db/models/chat_sessions";
export class Deepseek {
  async start() {
    await this.main();
  }

  async main() {
    let fetchpage = await this.fetch_page();

    fs.writeFileSync("./fetch_page.json", JSON.stringify(fetchpage));

    console.log(fetchpage);
  }

  async fetch_page(updated_at?: number | null) {
    let resp = await this.fetch_page_resp(updated_at);

    let fetchpage = (await resp.json()) as ApiResponse;
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

    return await fetch(str, {
      headers: {
        accept: "*/*",
        "accept-language": "ru,en-US;q=0.9,en;q=0.8",
        authorization: "Bearer 8Ji/4dcIBnws2l2B0ZGM7UPPSxbM6pudbpjpL1HwuSL0rvLPAxzWxjkn+1Zs0nS1",
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
        cookie:
          "HWWAFSESTIME=1738007477582; HWWAFSESID=31df2133e0f423528fe; intercom-device-id-guh50jw4=d93c5232-6bab-4aba-a985-9793a7708785; BENSESSCC_TAG=b7803c2b9c4c4d7fa5c8001845be86d0; HMACCOUNT=A319A977C622789A; Hm_lpvt_1fff341d7a963a4043e858ef0e19a17c=1739785523; ds_cookie_preference=%257B%2522level%2522%253A%2522all%2522%257D; ds_session_id=e474ac74b26745b596b683bd76cd405f; cf_clearance=ejRKEE4CVQP_cxLs.NFCRhWEbYYKLugBrZmLTdudboc-1764700995-1.2.1.1-GrR.qVdlVSPlpNxWvrbE0IRWVVcX5A_cGnKTj9jXU7WnkcGYC6CuHV1XX1yoYdJZ5JmkYk0Wn1bYK3mTsx50rTe7c8UovJ3XAXPBNtgqHWAkXXIOPcdPbA4d0IyTwjJskmRTxK3WKz_PfSHCjhh45dzqXDnJYwHj6u3OrnMI9rV7ubT7DxHDYt9Lrtg7jD7bX213oBmEID2T3gGQ1H9pVaQewRpeH9Ojgl3OV7PNKw4",
      },
      body: null,
      method: "GET",
    });
  }
}
