# 站長私有今日瀏覽統計

這個專案的網站版部署在 GitHub Pages。因為它是靜態站，所以如果你要在網站裡看到「今日瀏覽用戶」，就需要一個外部統計端點。

目前 repo 已經內建：

- 公開訪客匿名送出瀏覽事件
- 只有站長能讀取今日 `UV` / `PV`
- 站長金鑰只暫存在你自己的瀏覽器
- 頁面快捷鍵：`Ctrl/Cmd + Shift + O`

## 架構

- `POST /track`
  - 公開寫入
  - 記錄匿名瀏覽事件
- `GET /today?site=cisco-config-generator`
  - 私有讀取
  - 必須帶 `X-Owner-Key`
  - 回傳今日 `UV` / `PV`

## 這次新增的檔案

- `web/site-config.js`
- `analytics/cloudflare/worker.js`
- `analytics/cloudflare/schema.sql`
- `analytics/cloudflare/wrangler.example.toml`

## Cloudflare Worker + D1 部署

### 1. 建立 D1

建立一個 D1 database，例如：

- 名稱：`orion0825-cisco-editor-analytics`

然後執行 `analytics/cloudflare/schema.sql` 建表。

### 2. 建立 Worker

把 `analytics/cloudflare/worker.js` 當成 Worker 主程式。

環境變數需要：

- `ALLOWED_ORIGINS`

另外把 `OWNER_KEY` 用 Cloudflare secret 儲存，不要直接寫進 repo。

其中 `ALLOWED_ORIGINS` 建議至少包含：

- `https://orion0825.github.io`
- `http://127.0.0.1:4173`
- `http://localhost:4173`

### 3. 綁定 D1

使用 `analytics/cloudflare/wrangler.example.toml` 當範本，把：

- `database_id`
- `ALLOWED_ORIGINS`

換成你自己的值。

然後執行：

```bash
wrangler secret put OWNER_KEY --config analytics/cloudflare/wrangler.toml
```

### 4. 更新網站設定

把 `web/site-config.js` 的 `analyticsBaseUrl` 改成你的 Worker URL，例如：

```js
window.CISCO_EDITOR_CONFIG = Object.assign({
  analyticsSiteId: "cisco-config-generator",
  analyticsBaseUrl: "https://your-worker.workers.dev",
  ownerAnalyticsShortcut: "Ctrl/Cmd + Shift + O",
}, window.CISCO_EDITOR_CONFIG || {});
```

改完後推上 GitHub Pages。

### 5. 站長登入統計

開啟網站後：

1. 按 `Ctrl/Cmd + Shift + O`
   - 若快捷鍵被瀏覽器或外掛攔截，可改用 `?ownerStats=1`
2. 輸入 Worker Base URL
3. 輸入 `OWNER_KEY`
4. 點 `儲存本機設定`
5. 點 `讀取今日統計`

設定只存在你的瀏覽器，不會同步給其他使用者。

## 注意

- `UV` 是以單一瀏覽器匿名 ID 為基準，不是登入帳號。
- 如果訪客清除瀏覽器資料，會被視為新的匿名訪客。
- 這套是輕量統計，不是完整防刷架構。
