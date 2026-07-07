# Cisco Config Generator

這是一個用結構化 inventory 產生 Cisco IOS 風格設定檔的小型專案。目標是把設備參數集中放在 `inventory/devices.json`，再由產生器輸出可檢查、可版本控管的 `.cfg` 檔案。

## 使用流程

1. 編輯 `inventory/devices.json`。
2. 從專案根目錄產生設定檔：

   ```bash
   python -m configgen
   ```

3. 檢查 `generated-configs/` 內的輸出。
4. 確認沒有問題後，將 inventory 與產生後的 config 一起 commit 並 push 到 GitHub。

GitHub Actions 會在 push 與 pull request 時執行測試，並確認 `generated-configs/` 裡的設定檔是否已依照最新 inventory 重新產生。

## 專案結構

```text
configgen/             產生器程式
inventory/devices.json 設備與共用參數
generated-configs/     產生後的 Cisco config
tests/                 單元測試
.github/workflows/     GitHub Actions 檢查流程
```

## Inventory 支援項目

目前支援：

- L2 / L3 設備分類
- DNS、NTP、SSH、VTY 與本地使用者的全域預設值
- VLAN 定義
- routed interface
- access port，可選 voice VLAN
- trunk port，可設定 native VLAN 與 allowed VLAN
- SVI
- loopback
- IPv4 static route
- 基本 OSPF network statement
- 基本 EIGRP network、passive-interface、no auto-summary
- 基本 BGP neighbor、remote-as、router-id、network statement

密碼或敏感資料可以用環境變數引用，例如 `${CISCO_NETADMIN_SECRET}`。如果環境變數沒有設定，產生的 config 會顯示 `__MISSING_ENV_CISCO_NETADMIN_SECRET__`，方便在部署前發現問題。

### L2 / L3 分類

每台設備可以設定 `device_layer`：

```json
"device_layer": "L2"
```

或：

```json
"device_layer": "L3"
```

L2 設備會把 `0.0.0.0/0` static route 產生成 `ip default-gateway`，並禁止 OSPF、EIGRP、BGP、routed interface、loopback interface。L3 設備則會照一般 router / L3 switch 方式產生 static route 與動態路由。

### 路由功能分類

`routing` 底下會依路由類型分類：

```json
"routing": {
  "static": [
    { "destination": "0.0.0.0/0", "next_hop": "203.0.113.1" }
  ],
  "ospf": {
    "process_id": 10,
    "router_id": "10.255.0.1",
    "networks": [{ "prefix": "10.255.0.1/32", "area": 0 }]
  },
  "eigrp": {
    "asn": 100,
    "router_id": "10.255.0.1",
    "networks": [{ "prefix": "10.255.0.1/32" }],
    "passive_interfaces": ["GigabitEthernet0/1"],
    "no_auto_summary": true
  },
  "bgp": {
    "asn": 65001,
    "router_id": "10.255.0.1",
    "neighbors": [
      { "address": "203.0.113.1", "remote_as": 65000, "description": "ISP edge" }
    ],
    "networks": [{ "prefix": "203.0.113.0/30" }]
  }
}
```

### 輸入限制

為了避免產生不能貼進 Cisco CLI 的設定，產生器會擋掉中文、全形符號、換行、驚嘆號與常見非指令字元。Hostname、interface name、VLAN name、description、username、secret 等會進入 config 的欄位都會做檢查。

## 常用指令

請在專案根目錄執行：

```bash
python -m unittest discover -s tests -p 'test*.py'
python -m configgen
python -m configgen --check
```

`python -m configgen --check` 不會改檔案，只會檢查目前的 `generated-configs/` 是否和 inventory 產生結果一致。

## 圖形化介面

本專案也提供本機 Web GUI：

```text
web/index.html
```

打開後可以直接新增設備、編輯 VLAN/interface/static route/OSPF/EIGRP/BGP、匯入或匯出 `devices.json`，並複製或下載產生後的 `.cfg`。

GUI 是純前端靜態檔案，不需要 npm、Flask 或其他後端服務。若要和 CLI 流程接軌，建議在 GUI 匯出 JSON 後覆蓋 `inventory/devices.json`，再執行：

```bash
python -m configgen
python -m configgen --check
```

也可以透過 GitHub Pages 直接開啟：

```text
https://orion0825.github.io/cisco-config-generator/
```

若第一次打不開，請到 GitHub repo 的 `Settings` -> `Pages`，確認 Source 設成 `GitHub Actions`，然後到 `Actions` 手動執行 `Deploy Web GUI`。

## GitHub / VS Code 流程

已經建立 GitHub repo 後，日常流程建議如下：

```bash
git status
python -m configgen
python -m configgen --check
git add inventory generated-configs
git commit -m "Update generated Cisco configs"
git push
```

也可以直接在 VS Code 的 Source Control 面板操作 commit 與 push。只要 VS Code 已登入 GitHub，就可以用圖形介面發布分支與同步變更。

## 注意事項

- 不要直接手改 `generated-configs/*.cfg`，應該改 `inventory/devices.json` 後重新產生。
- 正式環境部署前，請先在 lab 或維護時段驗證 config。
- 目前產生器主要針對 IPv4 與常見 IOS 語法，若要支援 NX-OS、IOS XE 特定功能或更完整的 ACL/NAT/QoS/VRF，可以再擴充資料模型與產生邏輯。
