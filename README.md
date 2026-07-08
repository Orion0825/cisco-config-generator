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

## ATM 路由

ATM 模式只保留需要修改的欄位：

- 機號：只輸入機號，輸出自動加上 `ATM_`
- ADSL IP：輸入網段基底後自動帶 Route、WAN、NAT
- 補摺機：勾選後新增 `11.11.11.2` Static NAT
- Static Route、Interface IP、Static NAT 可手動微調

其他設定會依照內建範本保留。

## 安全提醒

此工具不會上傳資料到雲端，用戶暫存只存在瀏覽器或桌面 App 本機資料內。

未做 Apple / Microsoft code signing 時，macOS Gatekeeper、Windows SmartScreen 或防毒軟體可能出現提醒。建議從 GitHub Releases 下載並核對 `SHA256SUMS.txt`。
