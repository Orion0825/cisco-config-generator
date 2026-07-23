# Cisco Config Generator

Cisco 編輯器 by Orion。提供網頁版與桌面版，用來產生、上傳、檢查與下載 Cisco 設定檔。

## 網頁版

直接開啟：

https://orion0825.github.io/cisco-config-generator/

適合臨時產生設定檔、上傳 `.cfg` / `.txt` 檢查內容，或快速下載新的 CFG。

## 桌面版

下載最新版：

https://github.com/Orion0825/cisco-config-generator/releases/latest

支援 macOS 與 Windows。Release 內會提供 macOS `.dmg` / `.zip`、Windows `Setup.exe`，以及 `SHA256SUMS.txt` 供核對檔案。

## 主要功能

- 一般 L2 / L3 Cisco 設備設定檔產生
- VLAN、Interface、Static Route、OSPF、EIGRP、BGP
- VRF、Prefix-list、Route-map、STP、DHCP、ACL、NAT
- 上傳 `.cfg` / `.txt` 後同步到設定區
- 用戶本機暫存，不需要雲端帳號
- ATM 路由模式，支援 881、921、8130
- 站長私有今日瀏覽統計（需部署 Cloudflare Worker + D1）

## ATM 路由

ATM 模式只保留需要修改的欄位：

- 機號：只輸入機號，輸出自動加上 `ATM_`
- ADSL IP：輸入網段基底後自動帶 Route、WAN、NAT
- 補摺機：勾選後新增 `11.11.11.2` Static NAT
- Static Route、Interface IP、Static NAT 可手動微調

其他設定會依照內建範本保留。

## 站長今日瀏覽統計

網站端已內建站長私有統計入口：

- 快捷鍵：`Ctrl/Cmd + Shift + O`
- 若快捷鍵被瀏覽器攔截，可用網址參數：`?ownerStats=1`
- 可在頁面內讀取今日 `UV` / `PV`
- 站長金鑰只暫存在你自己的瀏覽器
- 公開訪客不會看到統計數字

因為 GitHub Pages 是靜態站，真實統計仍需要一個外部端點。
部署方式與範例程式在 [docs/owner-analytics.md](/Users/k/Documents/Codex/2026-07-07/ji3/docs/owner-analytics.md)。

## 安全提醒

此工具不會上傳資料到雲端，用戶暫存只存在瀏覽器或桌面 App 本機資料內。

若啟用站長統計，公開頁面只會送出匿名瀏覽事件；今日統計的讀取需要站長金鑰，且金鑰只保存在你自己的瀏覽器中。

未做 Apple / Microsoft code signing 時，macOS Gatekeeper、Windows SmartScreen 或防毒軟體可能出現提醒。建議從 GitHub Releases 下載並核對 `SHA256SUMS.txt`。
