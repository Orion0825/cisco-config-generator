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
- VRF、RD、route-target import/export
- Prefix-list
- Route-map match prefix-list、set local-preference、metric、AS-path prepend
- OSPF / EIGRP / BGP redistribute
- BGP neighbor route-map in/out、prefix-list in/out、next-hop-self、send-community、soft-reconfiguration
- VRF、ACL、Prefix-list、Route-map、NAT interface 與 BGP policy 引用檢查
- STP mode、PortFast default、BPDU Guard default、VLAN priority
- EtherChannel / Port-channel member `channel-group`
- Access port Port Security
- HSRP virtual gateway
- DHCP excluded-address 與 DHCP pool
- Named standard / extended ACL
- Interface ACL apply
- NAT inside/outside 與 overload
- IP helper-address

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
      {
        "address": "203.0.113.1",
        "remote_as": 65000,
        "description": "ISP edge",
        "route_map_out": "RM-CUST-A-OUT",
        "next_hop_self": true,
        "send_community": "both"
      }
    ],
    "networks": [{ "prefix": "203.0.113.0/30" }]
  }
}
```

### CCIE 常用 Policy 功能

可在設備層級定義 VRF、prefix-list、route-map，再套用到 interface、static route、BGP neighbor 或 redistribution：

```json
{
  "vrfs": [
    {
      "name": "CUST-A",
      "rd": "65001:10",
      "route_targets_import": ["65001:10"],
      "route_targets_export": ["65001:10"]
    }
  ],
  "prefix_lists": [
    { "name": "PL-CUST-A", "sequence": 10, "action": "permit", "prefix": "10.10.0.0/16", "ge": 24, "le": 32 }
  ],
  "route_maps": [
    {
      "name": "RM-CUST-A-OUT",
      "sequence": 10,
      "action": "permit",
      "match_prefix_lists": ["PL-CUST-A"],
      "set_local_preference": 200
    }
  ]
}
```

介面與路由可以引用：

```json
{
  "interfaces": [{ "name": "Vlan10", "mode": "svi", "address": "10.10.10.2/24", "vrf": "CUST-A" }],
  "routing": {
    "static": [{ "vrf": "CUST-A", "destination": "0.0.0.0/0", "next_hop": "10.10.10.1" }],
    "ospf": {
      "process_id": 10,
      "redistribute": [{ "source": "connected", "subnets": true, "route_map": "RM-CUST-A-OUT" }]
    }
  }
}
```

### 交換與常用 L3 功能

除了 routing 區塊之外，也可以在設備或介面上加入常用功能：

```json
{
  "spanning_tree": {
    "mode": "rapid-pvst",
    "portfast_default": true,
    "bpduguard_default": true,
    "vlan_priorities": [{ "vlans": [10, 20, 99], "priority": 4096 }]
  },
  "acls": [
    {
      "name": "INSIDE-NAT",
      "type": "extended",
      "entries": [
        { "action": "permit", "protocol": "ip", "source": "10.10.10.0/24", "destination": "any" }
      ]
    }
  ],
  "dhcp": {
    "excluded_addresses": [{ "start": "10.10.10.1", "end": "10.10.10.20" }],
    "pools": [
      {
        "name": "USERS",
        "network": "10.10.10.0/24",
        "default_router": "10.10.10.1",
        "dns_servers": ["1.1.1.1", "8.8.8.8"]
      }
    ]
  },
  "nat": {
    "inside_source": [
      { "acl": "INSIDE-NAT", "interface": "GigabitEthernet0/0", "overload": true }
    ]
  }
}
```

介面也可以加入：

```json
{
  "channel_group": 1,
  "channel_mode": "active",
  "nat_role": "inside",
  "helper_addresses": ["10.10.10.10"],
  "hsrp": [{ "group": 10, "virtual_ip": "10.10.10.1", "priority": 110, "preempt": true }],
  "access_groups": [{ "name": "WAN-IN", "direction": "in" }],
  "port_security": { "maximum": 2, "violation": "restrict", "sticky": true },
  "spanning_tree_bpduguard": true
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

打開後可以直接新增設備、編輯 VLAN/interface/static route/OSPF/EIGRP/BGP，也能在「進階」分頁直接調整 VRF、Prefix-list、Route-map、STP、DHCP、ACL、NAT。Interface 表格也支援 VRF、NAT role、IP helper、HSRP、ACL 套用、EtherChannel、Port Security 與 BPDU Guard。BGP neighbor 表格支援 route-map、prefix-list、next-hop-self、send-community 與 soft-reconfiguration。編輯後右側會即時產生 `.cfg`，也可以匯入或匯出 `devices.json`。

如果手上已經有 Cisco 設定檔，也可以按「上傳 CFG/TXT」或拖曳到右側上傳區，一次載入一個或多個 `.cfg` / `.txt`。上傳後會解析 hostname、VLAN、interface、static route、OSPF/EIGRP/BGP、VRF、ACL、NAT 等常見設定，並同步到左側設備列表與中央設定區；原始檔案也會出現在右側輸出選單的「上傳檔案」群組，能直接檢查、複製貼上或重新下載。

GUI 上方也有「用戶」暫存工作區。輸入英文/數字用戶名後登入，設備資料、目前上傳的 CFG/TXT、選到的輸出檔與目前分頁會暫存在瀏覽器或桌面 App 的 localStorage；下次用同一個用戶名開啟會自動載入。這是本機暫存功能，不是雲端帳號，換電腦或清除瀏覽器資料後不會保留。

GUI 也提供「ATM路由」區塊，內建 881、921、8130 三種型號範本。此區只開放修改 `hostname`、範本中已有 `ip address` 的 interface IP，以及 `ip nat inside source static` 每行最後一個 IP；description、ACL、SSH、NTP、static route 與其他設定會完全沿用範例。產出的 ATM config 會出現在右側輸出選單的「ATM路由」群組。

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

## 桌面版打包

此專案可打包成 macOS 與 Windows 桌面軟體。GitHub 會在更新 `web/`、`electron/` 或 `package.json` 後自動執行 `Build Desktop Apps` workflow，產出可下載的安裝檔。

手動本機測試：

```bash
npm install
npm run desktop
```

本機打包同平台版本：

```bash
npm run dist:mac
npm run dist:win
```

macOS 會輸出 `.dmg` 與 `.zip`，Windows 會輸出 `.exe` 安裝檔與 portable 版本。未做 Apple / Microsoft 簽章時，第一次開啟可能會出現安全提醒；正式發佈前建議再補 code signing。

要同時取得 macOS 與 Windows，建議直接用 GitHub Actions。進入 repo 的 `Actions` -> `Build Desktop Apps` -> 最新一次成功執行，下載 `Cisco-Config-Generator-macOS` 或 `Cisco-Config-Generator-Windows` artifact。

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
- 目前產生器主要針對 IPv4 與常見 IOS / IOS XE routing、switching、policy 語法，並會檢查 VRF、ACL、Prefix-list、Route-map、BGP policy、NAT interface 等引用是否存在。若後續要加入 MPLS L3VPN、IPv6、QoS class-map/policy-map 或 NX-OS 專用語法，可以在同一個資料模型繼續擴充。
