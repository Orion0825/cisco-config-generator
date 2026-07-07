const sampleInventory = {
  defaults: {
    domain_name: "lab.local",
    name_servers: ["1.1.1.1", "8.8.8.8"],
    ntp_servers: ["129.6.15.28"],
    ssh: { enabled: true, modulus: 2048 },
    vty: { transport: "ssh" },
    local_users: [
      {
        name: "netadmin",
        privilege: 15,
        secret_type: "0",
        secret: "${CISCO_NETADMIN_SECRET}",
      },
    ],
  },
  devices: [
    {
      hostname: "BRANCH-R1",
      role: "branch-router",
      device_layer: "L3",
      platform: "ios",
      interfaces: [
        { name: "GigabitEthernet0/0", description: "WAN uplink", mode: "routed", address: "203.0.113.2/30" },
        {
          name: "GigabitEthernet0/1",
          description: "LAN trunk to access switch",
          mode: "trunk",
          native_vlan: 99,
          allowed_vlans: [10, 20, 99],
        },
        { name: "Loopback0", description: "Router ID", mode: "loopback", address: "10.255.0.1/32" },
      ],
      vlans: [
        { id: 10, name: "USERS" },
        { id: 20, name: "VOICE" },
        { id: 99, name: "MGMT" },
      ],
      routing: {
        static: [{ destination: "0.0.0.0/0", next_hop: "203.0.113.1" }],
        ospf: {
          process_id: 10,
          router_id: "10.255.0.1",
          networks: [{ prefix: "10.255.0.1/32", area: 0 }],
        },
        eigrp: {
          asn: 100,
          router_id: "10.255.0.1",
          networks: [{ prefix: "10.255.0.1/32" }],
          passive_interfaces: ["GigabitEthernet0/1"],
          no_auto_summary: true,
        },
        bgp: {
          asn: 65001,
          router_id: "10.255.0.1",
          neighbors: [{ address: "203.0.113.1", remote_as: 65000, description: "ISP edge" }],
          networks: [{ prefix: "203.0.113.0/30" }],
        },
      },
    },
    {
      hostname: "ACCESS-SW1",
      role: "access-switch",
      device_layer: "L2",
      platform: "ios",
      vlans: [
        { id: 10, name: "USERS" },
        { id: 20, name: "VOICE" },
        { id: 99, name: "MGMT" },
      ],
      interfaces: [
        { name: "Vlan99", description: "Management SVI", mode: "svi", address: "10.99.0.11/24" },
        {
          name: "GigabitEthernet1/0/1",
          description: "Uplink to BRANCH-R1",
          mode: "trunk",
          native_vlan: 99,
          allowed_vlans: [10, 20, 99],
        },
        {
          name: "GigabitEthernet1/0/10",
          description: "User desk",
          mode: "access",
          access_vlan: 10,
          voice_vlan: 20,
          spanning_tree_portfast: true,
        },
      ],
      routing: {
        static: [{ destination: "0.0.0.0/0", next_hop: "10.99.0.1" }],
      },
    },
  ],
};

const DEVICE_LAYERS = new Set(["L2", "L3"]);
const CLI_SAFE_PATTERN = /^[A-Za-z0-9 _./:,@#()+=$*{}-]*$/;
const HOSTNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/;
const INTERFACE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9/_.:-]*$/;
const USERNAME_PATTERN = /^[A-Za-z0-9_.-]+$/;
const SANITIZE_RULES = {
  hostname: /[^A-Za-z0-9_.-]/g,
  interface: /[^A-Za-z0-9/_.:-]/g,
  ipList: /[^A-Za-z0-9.,:_/-]/g,
  cliText: /[^A-Za-z0-9 _./:,@#()+=$*{}-]/g,
};

let state = structuredClone(sampleInventory);
let selectedDeviceIndex = 0;
let selectedOutputFile = "";
let activeTab = "device";

const elements = {
  statusText: document.querySelector("#statusText"),
  fileInput: document.querySelector("#fileInput"),
  importBtn: document.querySelector("#importBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  addDeviceBtn: document.querySelector("#addDeviceBtn"),
  duplicateDeviceBtn: document.querySelector("#duplicateDeviceBtn"),
  deleteDeviceBtn: document.querySelector("#deleteDeviceBtn"),
  deviceCount: document.querySelector("#deviceCount"),
  deviceList: document.querySelector("#deviceList"),
  deviceTab: document.querySelector("#deviceTab"),
  defaultsTab: document.querySelector("#defaultsTab"),
  deviceForm: document.querySelector("#deviceForm"),
  defaultsForm: document.querySelector("#defaultsForm"),
  vlanRows: document.querySelector("#vlanRows"),
  interfaceRows: document.querySelector("#interfaceRows"),
  staticRouteSection: document.querySelector("#staticRouteSection"),
  staticRouteTitle: document.querySelector("#staticRouteTitle"),
  staticRouteRows: document.querySelector("#staticRouteRows"),
  ospfSection: document.querySelector("#ospfSection"),
  ospfEnabled: document.querySelector("#ospfEnabled"),
  ospfFields: document.querySelector("#ospfFields"),
  ospfProcessId: document.querySelector("#ospfProcessId"),
  ospfRouterId: document.querySelector("#ospfRouterId"),
  ospfNetworkRows: document.querySelector("#ospfNetworkRows"),
  eigrpSection: document.querySelector("#eigrpSection"),
  eigrpEnabled: document.querySelector("#eigrpEnabled"),
  eigrpFields: document.querySelector("#eigrpFields"),
  eigrpAsn: document.querySelector("#eigrpAsn"),
  eigrpRouterId: document.querySelector("#eigrpRouterId"),
  eigrpPassiveInterfaces: document.querySelector("#eigrpPassiveInterfaces"),
  eigrpNoAutoSummary: document.querySelector("#eigrpNoAutoSummary"),
  eigrpNetworkRows: document.querySelector("#eigrpNetworkRows"),
  bgpSection: document.querySelector("#bgpSection"),
  bgpEnabled: document.querySelector("#bgpEnabled"),
  bgpFields: document.querySelector("#bgpFields"),
  bgpAsn: document.querySelector("#bgpAsn"),
  bgpRouterId: document.querySelector("#bgpRouterId"),
  bgpNeighborRows: document.querySelector("#bgpNeighborRows"),
  bgpNetworkRows: document.querySelector("#bgpNetworkRows"),
  addVlanBtn: document.querySelector("#addVlanBtn"),
  addInterfaceBtn: document.querySelector("#addInterfaceBtn"),
  addStaticRouteBtn: document.querySelector("#addStaticRouteBtn"),
  addOspfNetworkBtn: document.querySelector("#addOspfNetworkBtn"),
  addEigrpNetworkBtn: document.querySelector("#addEigrpNetworkBtn"),
  addBgpNeighborBtn: document.querySelector("#addBgpNeighborBtn"),
  addBgpNetworkBtn: document.querySelector("#addBgpNetworkBtn"),
  outputCount: document.querySelector("#outputCount"),
  outputSelect: document.querySelector("#outputSelect"),
  configOutput: document.querySelector("#configOutput"),
  copyConfigBtn: document.querySelector("#copyConfigBtn"),
  downloadConfigBtn: document.querySelector("#downloadConfigBtn"),
  messages: document.querySelector("#messages"),
};

function currentDevice() {
  return state.devices[selectedDeviceIndex];
}

function normalizeInventory(inventory) {
  const normalized = structuredClone(inventory);
  normalized.defaults ||= {};
  normalized.defaults.name_servers ||= [];
  normalized.defaults.ntp_servers ||= [];
  normalized.defaults.ssh ||= { enabled: true, modulus: 2048 };
  normalized.defaults.vty ||= { transport: "ssh" };
  normalized.defaults.local_users ||= [];
  normalized.devices ||= [];
  normalized.devices.forEach((device) => {
    device.device_layer = normalizedDeviceLayer(device);
    device.vlans ||= [];
    device.interfaces ||= [];
    device.routing ||= {};
    device.routing.static ||= [];
    if (device.routing.ospf) device.routing.ospf.networks ||= [];
    if (device.routing.eigrp) {
      device.routing.eigrp.networks ||= [];
      device.routing.eigrp.passive_interfaces ||= [];
      device.routing.eigrp.no_auto_summary ??= true;
    }
    if (device.routing.bgp) {
      device.routing.bgp.neighbors ||= [];
      device.routing.bgp.networks ||= [];
    }
  });
  return normalized;
}

function newDevice() {
  return {
    hostname: `DEVICE-${state.devices.length + 1}`,
    role: "network-device",
    device_layer: "L3",
    platform: "ios",
    vlans: [],
    interfaces: [],
    routing: { static: [] },
  };
}

function render() {
  state = normalizeInventory(state);
  if (!state.devices.length) {
    state.devices.push(newDevice());
    selectedDeviceIndex = 0;
  }
  selectedDeviceIndex = Math.min(selectedDeviceIndex, state.devices.length - 1);
  renderDeviceList();
  renderForms();
  renderOutput();
}

function renderDeviceList() {
  elements.deviceCount.textContent = String(state.devices.length);
  elements.deviceList.innerHTML = "";

  state.devices.forEach((device, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `device-item${index === selectedDeviceIndex ? " active" : ""}`;
    button.innerHTML = `<span>${escapeHtml(device.hostname || "未命名設備")}</span><span>${escapeHtml(normalizedDeviceLayer(device))} · ${escapeHtml(device.role || device.platform || "ios")}</span>`;
    button.addEventListener("click", () => {
      selectedDeviceIndex = index;
      selectedOutputFile = "";
      render();
    });
    elements.deviceList.appendChild(button);
  });
}

function renderForms() {
  elements.deviceTab.classList.toggle("active", activeTab === "device");
  elements.defaultsTab.classList.toggle("active", activeTab === "defaults");
  elements.deviceForm.classList.toggle("hidden", activeTab !== "device");
  elements.defaultsForm.classList.toggle("hidden", activeTab !== "defaults");
  renderDeviceForm();
  renderDefaultsForm();
}

function renderDeviceForm() {
  const device = currentDevice();
  setFormValue(elements.deviceForm, "hostname", device.hostname || "");
  setFormValue(elements.deviceForm, "role", device.role || "");
  setFormValue(elements.deviceForm, "device_layer", normalizedDeviceLayer(device));
  setFormValue(elements.deviceForm, "platform", device.platform || "ios");
  setFormValue(elements.deviceForm, "domain_name", device.domain_name || "");
  const isL2 = normalizedDeviceLayer(device) === "L2";

  elements.vlanRows.innerHTML = "";
  device.vlans.forEach((vlan, index) => {
    elements.vlanRows.appendChild(rowElement("vlan", index, [
      field("ID", "id", vlan.id ?? "", "number", "span-2", { min: 1, max: 4094 }),
      field("Name", "name", vlan.name || "", "text", "span-5"),
    ]));
  });

  elements.interfaceRows.innerHTML = "";
  device.interfaces.forEach((item, index) => {
    const row = rowElement("interface", index, [
      field("Name", "name", item.name || "", "text", "span-3"),
      selectField("Mode", "mode", item.mode || "routed", ["routed", "access", "trunk", "svi", "loopback"], "span-2"),
      field("Description", "description", item.description || "", "text", "span-4"),
      field("Address", "address", item.address || "", "text", "span-3 mode-l3"),
      field("Access VLAN", "access_vlan", item.access_vlan ?? "", "number", "span-2 mode-access", { min: 1, max: 4094 }),
      field("Voice VLAN", "voice_vlan", item.voice_vlan ?? "", "number", "span-2 mode-access", { min: 1, max: 4094 }),
      field("Native VLAN", "native_vlan", item.native_vlan ?? "", "number", "span-2 mode-trunk", { min: 1, max: 4094 }),
      field("Allowed VLANs", "allowed_vlans", (item.allowed_vlans || []).join(","), "text", "span-4 mode-trunk"),
      checkboxField("Portfast", "spanning_tree_portfast", !!item.spanning_tree_portfast, "span-2 mode-access"),
      checkboxField("Shutdown", "shutdown", !!item.shutdown, "span-2"),
    ]);
    updateInterfaceVisibility(row, item.mode || "routed");
    elements.interfaceRows.appendChild(row);
  });

  const staticRoutes = device.routing?.static || [];
  elements.staticRouteTitle.textContent = isL2 ? "L2 Default Gateway" : "Static Route";
  elements.addStaticRouteBtn.textContent = isL2 ? "設定 Gateway" : "新增路由";
  elements.staticRouteRows.innerHTML = "";
  staticRoutes.forEach((route, index) => {
    elements.staticRouteRows.appendChild(rowElement("static", index, [
      field("Destination", "destination", route.destination || "", "text", "span-5"),
      field("Next Hop", "next_hop", route.next_hop || "", "text", "span-5"),
    ]));
  });

  elements.ospfSection.classList.toggle("hidden", isL2);
  const ospf = isL2 ? undefined : device.routing?.ospf;
  elements.ospfEnabled.checked = !!ospf;
  elements.ospfFields.classList.toggle("hidden", !ospf);
  elements.ospfProcessId.value = ospf?.process_id ?? 1;
  elements.ospfRouterId.value = ospf?.router_id || "";
  elements.ospfNetworkRows.innerHTML = "";
  (ospf?.networks || []).forEach((network, index) => {
    elements.ospfNetworkRows.appendChild(rowElement("ospfNetwork", index, [
      field("Prefix", "prefix", network.prefix || "", "text", "span-6"),
      field("Area", "area", network.area ?? 0, "number", "span-3", { min: 0 }),
    ]));
  });

  elements.eigrpSection.classList.toggle("hidden", isL2);
  const eigrp = isL2 ? undefined : device.routing?.eigrp;
  elements.eigrpEnabled.checked = !!eigrp;
  elements.eigrpFields.classList.toggle("hidden", !eigrp);
  elements.eigrpAsn.value = eigrp?.asn ?? 100;
  elements.eigrpRouterId.value = eigrp?.router_id || "";
  elements.eigrpPassiveInterfaces.value = (eigrp?.passive_interfaces || []).join(",");
  elements.eigrpNoAutoSummary.checked = eigrp?.no_auto_summary !== false;
  elements.eigrpNetworkRows.innerHTML = "";
  (eigrp?.networks || []).forEach((network, index) => {
    elements.eigrpNetworkRows.appendChild(rowElement("eigrpNetwork", index, [
      field("Prefix", "prefix", network.prefix || "", "text", "span-10"),
    ]));
  });

  elements.bgpSection.classList.toggle("hidden", isL2);
  const bgp = isL2 ? undefined : device.routing?.bgp;
  elements.bgpEnabled.checked = !!bgp;
  elements.bgpFields.classList.toggle("hidden", !bgp);
  elements.bgpAsn.value = bgp?.asn ?? 65001;
  elements.bgpRouterId.value = bgp?.router_id || "";
  elements.bgpNeighborRows.innerHTML = "";
  (bgp?.neighbors || []).forEach((neighbor, index) => {
    elements.bgpNeighborRows.appendChild(rowElement("bgpNeighbor", index, [
      field("Address", "address", neighbor.address || "", "text", "span-3"),
      field("Remote ASN", "remote_as", neighbor.remote_as ?? "", "number", "span-2", { min: 1 }),
      field("Description", "description", neighbor.description || "", "text", "span-3"),
      field("Update Source", "update_source", neighbor.update_source || "", "text", "span-3"),
    ]));
  });
  elements.bgpNetworkRows.innerHTML = "";
  (bgp?.networks || []).forEach((network, index) => {
    elements.bgpNetworkRows.appendChild(rowElement("bgpNetwork", index, [
      field("Prefix", "prefix", network.prefix || "", "text", "span-10"),
    ]));
  });
}

function renderDefaultsForm() {
  const defaults = state.defaults;
  const user = defaults.local_users?.[0] || {};
  setFormValue(elements.defaultsForm, "domain_name", defaults.domain_name || "");
  setFormValue(elements.defaultsForm, "name_servers", (defaults.name_servers || []).join(","));
  setFormValue(elements.defaultsForm, "ntp_servers", (defaults.ntp_servers || []).join(","));
  setFormValue(elements.defaultsForm, "vty_transport", defaults.vty?.transport || "ssh");
  setFormValue(elements.defaultsForm, "ssh_enabled", !!defaults.ssh?.enabled);
  setFormValue(elements.defaultsForm, "ssh_modulus", defaults.ssh?.modulus || 2048);
  setFormValue(elements.defaultsForm, "local_user_name", user.name || "");
  setFormValue(elements.defaultsForm, "local_user_privilege", user.privilege ?? 15);
  setFormValue(elements.defaultsForm, "local_user_secret_type", user.secret_type || "0");
  setFormValue(elements.defaultsForm, "local_user_secret", user.secret || "");
}

function renderOutput() {
  const result = renderInventory(state);
  const files = Object.keys(result.configs);
  selectedOutputFile = selectedOutputFile && result.configs[selectedOutputFile] ? selectedOutputFile : files[0] || "";
  elements.outputSelect.innerHTML = "";

  files.forEach((filename) => {
    const option = document.createElement("option");
    option.value = filename;
    option.textContent = filename;
    elements.outputSelect.appendChild(option);
  });

  elements.outputSelect.value = selectedOutputFile;
  elements.configOutput.value = result.configs[selectedOutputFile] || "";
  elements.outputCount.textContent = String(files.length);
  elements.statusText.textContent = result.errors.length ? "設定檔需要修正" : `已產生 ${files.length} 份設定檔`;
  renderMessages(result.errors, result.warnings);
}

function renderMessages(errors, warnings) {
  elements.messages.innerHTML = "";
  const items = [
    ...errors.map((message) => ({ type: "message-error", message })),
    ...warnings.map((message) => ({ type: "message-warning", message })),
  ];

  if (!items.length) {
    elements.messages.textContent = "檢查通過";
    return;
  }

  items.forEach((item) => {
    const line = document.createElement("div");
    line.className = item.type;
    line.textContent = item.message;
    elements.messages.appendChild(line);
  });
}

function rowElement(kind, index, fields) {
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.kind = kind;
  row.dataset.index = String(index);
  fields.forEach((item) => row.appendChild(item));

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "row-action danger";
  remove.dataset.action = "remove";
  remove.dataset.kind = kind;
  remove.dataset.index = String(index);
  remove.textContent = "刪除";
  row.appendChild(remove);
  return row;
}

function field(labelText, key, value, type, className = "", attrs = {}) {
  const label = document.createElement("label");
  label.className = className;
  label.textContent = labelText;
  const input = document.createElement("input");
  input.type = type;
  input.dataset.key = key;
  input.value = value;
  Object.entries(attrs).forEach(([name, attrValue]) => input.setAttribute(name, attrValue));
  label.appendChild(input);
  return label;
}

function selectField(labelText, key, value, options, className = "") {
  const label = document.createElement("label");
  label.className = className;
  label.textContent = labelText;
  const select = document.createElement("select");
  select.dataset.key = key;
  options.forEach((item) => {
    const option = document.createElement("option");
    option.value = item;
    option.textContent = item;
    select.appendChild(option);
  });
  select.value = value;
  label.appendChild(select);
  return label;
}

function checkboxField(labelText, key, value, className = "") {
  const label = document.createElement("label");
  label.className = `switch ${className}`;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.dataset.key = key;
  input.checked = value;
  const span = document.createElement("span");
  span.textContent = labelText;
  label.append(input, span);
  return label;
}

function updateInterfaceVisibility(row, mode) {
  const l3 = mode === "routed" || mode === "svi" || mode === "loopback";
  row.querySelectorAll(".mode-l3").forEach((item) => item.classList.toggle("mode-hidden", !l3));
  row.querySelectorAll(".mode-access").forEach((item) => item.classList.toggle("mode-hidden", mode !== "access"));
  row.querySelectorAll(".mode-trunk").forEach((item) => item.classList.toggle("mode-hidden", mode !== "trunk"));
}

function setFormValue(form, name, value) {
  const input = form.elements[name];
  if (!input) return;
  if (input.type === "checkbox") {
    input.checked = !!value;
  } else {
    input.value = value;
  }
}

function sanitizeTargetInput(target) {
  if (!(target instanceof HTMLInputElement) || target.type !== "text") return;
  const original = target.value;
  let cleaned = original;
  const key = target.dataset.key || target.name || target.id;
  const rowKind = target.closest(".row")?.dataset.kind;

  if (key === "hostname") cleaned = original.replace(SANITIZE_RULES.hostname, "");
  else if (key === "name" && rowKind === "interface") cleaned = original.replace(SANITIZE_RULES.interface, "");
  else if (key === "update_source") cleaned = original.replace(SANITIZE_RULES.interface, "");
  else if (["address", "destination", "next_hop", "prefix", "ospfRouterId", "eigrpRouterId", "bgpRouterId"].includes(key)) cleaned = original.replace(SANITIZE_RULES.ipList, "");
  else if (key === "eigrpPassiveInterfaces") cleaned = original.replace(SANITIZE_RULES.ipList, "");
  else if (["name_servers", "ntp_servers"].includes(key)) cleaned = original.replace(SANITIZE_RULES.ipList, "");
  else cleaned = original.replace(SANITIZE_RULES.cliText, "");

  if (cleaned !== original) {
    const cursor = target.selectionStart ?? cleaned.length;
    target.value = cleaned;
    target.setSelectionRange(Math.max(0, cursor - (original.length - cleaned.length)), Math.max(0, cursor - (original.length - cleaned.length)));
    elements.statusText.textContent = "已移除中文或非 Cisco CLI 安全字元";
  }
}

function updateDeviceFromForm(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  sanitizeTargetInput(target);
  const device = currentDevice();
  if (target.name) {
    device[target.name] = target.value.trim();
    if (target.name === "device_layer") {
      device.device_layer = normalizedDeviceLayer(device);
      if (device.device_layer === "L2") {
        if (device.routing?.ospf) delete device.routing.ospf;
        if (device.routing?.eigrp) delete device.routing.eigrp;
        if (device.routing?.bgp) delete device.routing.bgp;
      }
    }
    if (target.name === "hostname") selectedOutputFile = "";
    renderDeviceList();
    if (target.name === "device_layer") renderForms();
    renderOutput();
  }
}

function updateDefaultsFromForm(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  sanitizeTargetInput(target);
  const defaults = state.defaults;
  if (target.name === "domain_name") defaults.domain_name = target.value.trim();
  if (target.name === "name_servers") defaults.name_servers = splitList(target.value);
  if (target.name === "ntp_servers") defaults.ntp_servers = splitList(target.value);
  if (target.name === "vty_transport") defaults.vty = { transport: target.value };
  if (target.name === "ssh_enabled") defaults.ssh = { ...(defaults.ssh || {}), enabled: target.checked };
  if (target.name === "ssh_modulus") defaults.ssh = { ...(defaults.ssh || {}), modulus: toNumber(target.value, 2048) };

  if (target.name.startsWith("local_user_")) {
    defaults.local_users = defaults.local_users || [{}];
    const user = defaults.local_users[0];
    if (target.name === "local_user_name") user.name = target.value.trim();
    if (target.name === "local_user_privilege") user.privilege = toNumber(target.value, 15);
    if (target.name === "local_user_secret_type") user.secret_type = target.value.trim();
    if (target.name === "local_user_secret") user.secret = target.value;
  }
  renderOutput();
}

function updateRowFromEvent(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  sanitizeTargetInput(target);
  const row = target.closest(".row");
  if (!row) return;
  const kind = row.dataset.kind;
  const index = Number(row.dataset.index);
  const key = target.dataset.key;
  if (!kind || !key) return;

  const device = currentDevice();
  const value = target.type === "checkbox" ? target.checked : target.value;

  if (kind === "vlan") {
    device.vlans[index][key] = key === "id" ? toNumber(value, "") : value.trim();
  }
  if (kind === "interface") {
    const iface = device.interfaces[index];
    if (key === "allowed_vlans") {
      iface[key] = splitList(value).map((item) => toNumber(item, item));
    } else if (["access_vlan", "voice_vlan", "native_vlan"].includes(key)) {
      if (value === "") delete iface[key];
      else iface[key] = toNumber(value, value);
    } else if (["shutdown", "spanning_tree_portfast"].includes(key)) {
      iface[key] = value;
    } else {
      iface[key] = String(value).trim();
    }
    if (key === "mode") updateInterfaceVisibility(row, value);
  }
  if (kind === "static") {
    device.routing.static[index][key] = value.trim();
  }
  if (kind === "ospfNetwork") {
    device.routing.ospf.networks[index][key] = key === "area" ? toNumber(value, 0) : value.trim();
  }
  if (kind === "eigrpNetwork") {
    device.routing.eigrp.networks[index][key] = value.trim();
  }
  if (kind === "bgpNeighbor") {
    const neighbor = device.routing.bgp.neighbors[index];
    if (key === "remote_as") neighbor[key] = toNumber(value, value);
    else if (value === "") delete neighbor[key];
    else neighbor[key] = value.trim();
  }
  if (kind === "bgpNetwork") {
    device.routing.bgp.networks[index][key] = value.trim();
  }
  renderOutput();
}

function removeRow(kind, index) {
  const device = currentDevice();
  if (kind === "vlan") device.vlans.splice(index, 1);
  if (kind === "interface") device.interfaces.splice(index, 1);
  if (kind === "static") device.routing.static.splice(index, 1);
  if (kind === "ospfNetwork") device.routing.ospf.networks.splice(index, 1);
  if (kind === "eigrpNetwork") device.routing.eigrp.networks.splice(index, 1);
  if (kind === "bgpNeighbor") device.routing.bgp.neighbors.splice(index, 1);
  if (kind === "bgpNetwork") device.routing.bgp.networks.splice(index, 1);
  render();
}

function renderInventory(inventory) {
  const errors = validateInventory(inventory);
  const warnings = [];
  const configs = {};

  inventory.devices.forEach((device) => {
    try {
      const filename = `${safeFilename(device.hostname || "device")}.cfg`;
      configs[filename] = renderDevice(inventory.defaults || {}, device);
      if (configs[filename].includes("__MISSING_ENV_")) warnings.push(`${filename}: secret 環境變數未設定`);
    } catch (error) {
      errors.push(`${device.hostname || "device"}: ${error.message}`);
    }
  });

  return { configs, errors, warnings };
}

function renderDevice(defaults, device) {
  const lines = [];
  const add = (line = "") => lines.push(line);
  const hostname = required(device.hostname, "hostname");
  const layer = normalizedDeviceLayer(device);

  add("!");
  add("! Generated by configgen web UI. Edit inventory/devices.json, then regenerate.");
  add(`! Device layer: ${layer}`);
  add("!");
  add(`hostname ${hostname}`);
  add("no ip domain-lookup");
  add("service timestamps debug datetime msec");
  add("service timestamps log datetime msec");
  add("service password-encryption");

  const domain = device.domain_name || defaults.domain_name;
  if (domain) add(`ip domain-name ${domain}`);
  [...(defaults.name_servers || []), ...(device.name_servers || [])].forEach((server) => add(`ip name-server ${server}`));
  [...(defaults.ntp_servers || []), ...(device.ntp_servers || [])].forEach((server) => add(`ntp server ${server}`));

  const users = [...(defaults.local_users || []), ...(device.local_users || [])].filter((user) => user.name);
  users.forEach((user) => {
    add(`username ${user.name} privilege ${user.privilege ?? 15} secret ${user.secret_type || "0"} ${resolveEnv(user.secret || "CHANGE_ME")}`);
  });

  if (defaults.ssh?.enabled !== false || device.ssh?.enabled) {
    add("ip ssh version 2");
    add(`crypto key generate rsa modulus ${Number(device.ssh?.modulus || defaults.ssh?.modulus || 2048)}`);
  }

  add("!");
  [...(device.vlans || [])]
    .sort((a, b) => Number(a.id) - Number(b.id))
    .forEach((vlan) => {
      add(`vlan ${Number(vlan.id)}`);
      if (vlan.name) add(` name ${vlan.name}`);
      add("!");
    });

  (device.interfaces || []).forEach((iface) => renderInterface(lines, iface));
  renderRouting(lines, device.routing || {}, layer);
  add("line vty 0 4");
  add(users.length ? " login local" : " no login");
  add(` transport input ${device.vty?.transport || defaults.vty?.transport || "ssh"}`);
  add("!");
  add("end");
  return `${lines.join("\n").trimEnd()}\n`;
}

function renderInterface(lines, iface) {
  const mode = iface.mode || "routed";
  lines.push(`interface ${required(iface.name, "interface name")}`);
  if (iface.description) lines.push(` description ${iface.description}`);

  if (["routed", "svi", "loopback"].includes(mode)) {
    if (iface.address) {
      const [address, mask] = iosAddress(iface.address);
      lines.push(` ip address ${address} ${mask}`);
    } else {
      lines.push(" no ip address");
    }
  }
  if (mode === "access") {
    lines.push(" switchport");
    lines.push(" switchport mode access");
    lines.push(` switchport access vlan ${Number(required(iface.access_vlan, "access vlan"))}`);
    if (iface.voice_vlan) lines.push(` switchport voice vlan ${Number(iface.voice_vlan)}`);
    if (iface.spanning_tree_portfast) lines.push(" spanning-tree portfast");
  }
  if (mode === "trunk") {
    lines.push(" switchport");
    lines.push(" switchport mode trunk");
    if (iface.native_vlan) lines.push(` switchport trunk native vlan ${Number(iface.native_vlan)}`);
    if (iface.allowed_vlans?.length) lines.push(` switchport trunk allowed vlan ${iface.allowed_vlans.map(Number).join(",")}`);
  }
  if (mode !== "loopback") lines.push(iface.shutdown ? " shutdown" : " no shutdown");
  lines.push("!");
}

function renderRouting(lines, routing, layer = "L3") {
  if (layer === "L2") {
    (routing.static || []).forEach((route) => {
      const prefix = parseIpv4Prefix(required(route.destination, "L2 default gateway destination"));
      if (prefix.length === 0) lines.push(`ip default-gateway ${required(route.next_hop, "L2 default gateway")}`);
    });
    if ((routing.static || []).length) lines.push("!");
    return;
  }

  (routing.static || []).forEach((route) => {
    const prefix = parseIpv4Prefix(required(route.destination, "static route destination"));
    lines.push(`ip route ${intToIp(prefix.network)} ${intToIp(prefix.mask)} ${required(route.next_hop, "static route next hop")}`);
  });

  if (routing.ospf) {
    lines.push("!");
    lines.push(`router ospf ${Number(routing.ospf.process_id || 1)}`);
    if (routing.ospf.router_id) lines.push(` router-id ${routing.ospf.router_id}`);
    (routing.ospf.networks || []).forEach((network) => {
      const prefix = parseIpv4Prefix(required(network.prefix, "ospf network prefix"));
      lines.push(` network ${intToIp(prefix.network)} ${intToIp(prefix.hostmask)} area ${network.area ?? 0}`);
    });
  }

  if (routing.eigrp) {
    lines.push("!");
    lines.push(`router eigrp ${Number(required(routing.eigrp.asn, "eigrp asn"))}`);
    if (routing.eigrp.router_id) lines.push(` eigrp router-id ${routing.eigrp.router_id}`);
    (routing.eigrp.networks || []).forEach((network) => {
      const prefix = parseIpv4Prefix(required(network.prefix, "eigrp network prefix"));
      lines.push(` network ${intToIp(prefix.network)} ${intToIp(prefix.hostmask)}`);
    });
    (routing.eigrp.passive_interfaces || []).forEach((name) => lines.push(` passive-interface ${name}`));
    if (routing.eigrp.no_auto_summary !== false) lines.push(" no auto-summary");
  }

  if (routing.bgp) {
    lines.push("!");
    lines.push(`router bgp ${Number(required(routing.bgp.asn, "bgp asn"))}`);
    if (routing.bgp.router_id) lines.push(` bgp router-id ${routing.bgp.router_id}`);
    (routing.bgp.neighbors || []).forEach((neighbor) => {
      lines.push(` neighbor ${required(neighbor.address, "bgp neighbor address")} remote-as ${Number(required(neighbor.remote_as, "bgp remote as"))}`);
      if (neighbor.description) lines.push(` neighbor ${neighbor.address} description ${neighbor.description}`);
      if (neighbor.update_source) lines.push(` neighbor ${neighbor.address} update-source ${neighbor.update_source}`);
    });
    (routing.bgp.networks || []).forEach((network) => {
      const prefix = parseIpv4Prefix(required(network.prefix, "bgp network prefix"));
      lines.push(` network ${intToIp(prefix.network)} mask ${intToIp(prefix.mask)}`);
    });
  }
  if ((routing.static || []).length || routing.ospf || routing.eigrp || routing.bgp) lines.push("!");
}

function validateInventory(inventory) {
  const errors = [];
  const defaults = inventory.defaults || {};
  validateCliSafe(defaults.domain_name, "defaults.domain_name", errors);
  (defaults.name_servers || []).forEach((value, index) => validateCliSafe(value, `defaults.name_servers[${index}]`, errors));
  (defaults.ntp_servers || []).forEach((value, index) => validateCliSafe(value, `defaults.ntp_servers[${index}]`, errors));
  validateCliSafe(defaults.vty?.transport, "defaults.vty.transport", errors);
  (defaults.local_users || []).forEach((user, index) => {
    if (user.name && !USERNAME_PATTERN.test(user.name)) errors.push(`defaults.local_users[${index}].name 含非 CLI 安全字元`);
    validateCliSafe(user.secret_type, `defaults.local_users[${index}].secret_type`, errors);
    validateCliSafe(user.secret, `defaults.local_users[${index}].secret`, errors);
  });

  if (!Array.isArray(inventory.devices) || !inventory.devices.length) errors.push("devices 必須至少有一台設備");
  const hostnames = new Set();

  (inventory.devices || []).forEach((device, deviceIndex) => {
    const layer = normalizedDeviceLayer(device);
    if (!device.hostname) errors.push(`devices[${deviceIndex}].hostname 必填`);
    if (device.hostname && !HOSTNAME_PATTERN.test(device.hostname)) errors.push(`${device.hostname}: hostname 含中文或非 CLI 安全字元`);
    if (!DEVICE_LAYERS.has(layer)) errors.push(`${device.hostname}: device_layer 必須是 L2 或 L3`);
    validateCliSafe(device.role, `${device.hostname}.role`, errors);
    validateCliSafe(device.platform, `${device.hostname}.platform`, errors);
    validateCliSafe(device.domain_name, `${device.hostname}.domain_name`, errors);
    if (device.hostname && hostnames.has(device.hostname)) errors.push(`hostname 重複: ${device.hostname}`);
    hostnames.add(device.hostname);

    const vlans = new Set();
    (device.vlans || []).forEach((vlan, vlanIndex) => {
      const id = Number(vlan.id);
      if (!Number.isInteger(id) || id < 1 || id > 4094) errors.push(`${device.hostname}.vlans[${vlanIndex}].id 必須是 1-4094`);
      validateCliSafe(vlan.name, `${device.hostname}.vlans[${vlanIndex}].name`, errors);
      if (vlans.has(id)) errors.push(`${device.hostname}.vlans[${vlanIndex}].id 重複`);
      vlans.add(id);
    });

    const interfaces = new Set();
    (device.interfaces || []).forEach((iface, ifaceIndex) => {
      if (!iface.name) errors.push(`${device.hostname}.interfaces[${ifaceIndex}].name 必填`);
      if (iface.name && !INTERFACE_NAME_PATTERN.test(iface.name)) errors.push(`${device.hostname}.${iface.name}: interface name 含非 CLI 安全字元`);
      if (iface.name && interfaces.has(iface.name)) errors.push(`${device.hostname}.interfaces[${ifaceIndex}].name 重複`);
      interfaces.add(iface.name);
      validateCliSafe(iface.description, `${device.hostname}.${iface.name}.description`, errors);
      if (layer === "L2" && ["routed", "loopback"].includes(iface.mode)) errors.push(`${device.hostname}.${iface.name}: L2 設備不允許 ${iface.mode} 介面`);
      if (iface.address) validatePrefix(iface.address, `${device.hostname}.${iface.name}.address`, errors);
      if (iface.mode === "access" && !iface.access_vlan) errors.push(`${device.hostname}.${iface.name}.access_vlan 必填`);
    });

    (device.routing?.static || []).forEach((route, routeIndex) => {
      const prefix = parsePrefixForValidation(route.destination, `${device.hostname}.routing.static[${routeIndex}].destination`, errors);
      if (layer === "L2" && prefix && prefix.length !== 0) errors.push(`${device.hostname}: L2 設備只允許 0.0.0.0/0 作為管理閘道`);
      validateIp(route.next_hop, `${device.hostname}.routing.static[${routeIndex}].next_hop`, errors);
    });

    if (layer === "L2" && device.routing?.ospf) errors.push(`${device.hostname}: L2 設備不允許 OSPF`);
    if (layer === "L2" && device.routing?.eigrp) errors.push(`${device.hostname}: L2 設備不允許 EIGRP`);
    if (layer === "L2" && device.routing?.bgp) errors.push(`${device.hostname}: L2 設備不允許 BGP`);
    if (device.routing?.ospf) {
      const processId = Number(device.routing.ospf.process_id || 1);
      if (!Number.isInteger(processId) || processId < 1) errors.push(`${device.hostname}.routing.ospf.process_id 必須大於 0`);
      if (device.routing.ospf.router_id) validateIp(device.routing.ospf.router_id, `${device.hostname}.routing.ospf.router_id`, errors);
    }
    (device.routing?.ospf?.networks || []).forEach((network, networkIndex) => {
      validatePrefix(network.prefix, `${device.hostname}.routing.ospf.networks[${networkIndex}].prefix`, errors);
      const area = Number(network.area ?? 0);
      if (!Number.isInteger(area) || area < 0) errors.push(`${device.hostname}.routing.ospf.networks[${networkIndex}].area 必須是 0 或正整數`);
    });

    if (device.routing?.eigrp) {
      validateAsn(device.routing.eigrp.asn, `${device.hostname}.routing.eigrp.asn`, errors);
      if (device.routing.eigrp.router_id) validateIp(device.routing.eigrp.router_id, `${device.hostname}.routing.eigrp.router_id`, errors);
      (device.routing.eigrp.networks || []).forEach((network, networkIndex) => {
        validatePrefix(network.prefix, `${device.hostname}.routing.eigrp.networks[${networkIndex}].prefix`, errors);
      });
      (device.routing.eigrp.passive_interfaces || []).forEach((name, index) => {
        if (!INTERFACE_NAME_PATTERN.test(name)) errors.push(`${device.hostname}.routing.eigrp.passive_interfaces[${index}] 含非 CLI 安全字元`);
      });
    }

    if (device.routing?.bgp) {
      validateAsn(device.routing.bgp.asn, `${device.hostname}.routing.bgp.asn`, errors);
      if (device.routing.bgp.router_id) validateIp(device.routing.bgp.router_id, `${device.hostname}.routing.bgp.router_id`, errors);
      (device.routing.bgp.neighbors || []).forEach((neighbor, neighborIndex) => {
        validateIp(neighbor.address, `${device.hostname}.routing.bgp.neighbors[${neighborIndex}].address`, errors);
        validateAsn(neighbor.remote_as, `${device.hostname}.routing.bgp.neighbors[${neighborIndex}].remote_as`, errors);
        validateCliSafe(neighbor.description, `${device.hostname}.routing.bgp.neighbors[${neighborIndex}].description`, errors);
        if (neighbor.update_source && !INTERFACE_NAME_PATTERN.test(neighbor.update_source)) {
          errors.push(`${device.hostname}.routing.bgp.neighbors[${neighborIndex}].update_source 含非 CLI 安全字元`);
        }
      });
      (device.routing.bgp.networks || []).forEach((network, networkIndex) => {
        validatePrefix(network.prefix, `${device.hostname}.routing.bgp.networks[${networkIndex}].prefix`, errors);
      });
    }
  });
  return errors;
}

function validateCliSafe(value, label, errors) {
  if (value && !CLI_SAFE_PATTERN.test(String(value))) errors.push(`${label} 含中文或非 Cisco CLI 安全字元`);
}

function parsePrefixForValidation(value, label, errors) {
  try {
    return parseIpv4Prefix(value);
  } catch {
    errors.push(`${label} 不是有效 IPv4 prefix`);
    return null;
  }
}

function validatePrefix(value, label, errors) {
  try {
    parseIpv4Prefix(value);
  } catch {
    errors.push(`${label} 不是有效 IPv4 prefix`);
  }
}

function validateIp(value, label, errors) {
  if (!value) {
    errors.push(`${label} 必填`);
    return;
  }
  try {
    ipToInt(value);
  } catch {
    errors.push(`${label} 不是有效 IPv4 位址`);
  }
}

function validateAsn(value, label, errors) {
  const asn = Number(value);
  if (!Number.isInteger(asn) || asn < 1 || asn > 4294967295) errors.push(`${label} 必須是 1-4294967295`);
}

function iosAddress(value) {
  const prefix = parseIpv4Prefix(value);
  return [intToIp(prefix.ip), intToIp(prefix.mask)];
}

function parseIpv4Prefix(value) {
  const [address, lengthText] = String(value || "").split("/");
  const length = Number(lengthText);
  if (!Number.isInteger(length) || length < 0 || length > 32) throw new Error("invalid prefix length");
  const ip = ipToInt(address);
  const mask = length === 0 ? 0 : (0xffffffff << (32 - length)) >>> 0;
  const network = (ip & mask) >>> 0;
  const hostmask = (~mask) >>> 0;
  return { ip, mask, network, hostmask, length };
}

function ipToInt(value) {
  const parts = String(value || "").split(".");
  if (parts.length !== 4) throw new Error("invalid ip");
  return parts.reduce((acc, part) => {
    if (!/^\d+$/.test(part)) throw new Error("invalid ip");
    const octet = Number(part);
    if (octet < 0 || octet > 255) throw new Error("invalid ip");
    return ((acc << 8) + octet) >>> 0;
  }, 0);
}

function intToIp(value) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}

function required(value, label) {
  if (value === undefined || value === null || value === "") throw new Error(`${label} is required`);
  return value;
}

function resolveEnv(value) {
  return String(value).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => `__MISSING_ENV_${name}__`);
}

function safeFilename(value) {
  return String(value).replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^[._]+|[._]+$/g, "") || "device";
}

function normalizedDeviceLayer(device) {
  const layer = String(device.device_layer || "L3").toUpperCase();
  return DEVICE_LAYERS.has(layer) ? layer : "L3";
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toNumber(value, fallback) {
  if (value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  })[char]);
}

function download(filename, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  elements.configOutput.select();
  document.execCommand("copy");
}

elements.importBtn.addEventListener("click", () => elements.fileInput.click());
elements.fileInput.addEventListener("change", async () => {
  const file = elements.fileInput.files?.[0];
  if (!file) return;
  try {
    state = normalizeInventory(JSON.parse(await file.text()));
    selectedDeviceIndex = 0;
    selectedOutputFile = "";
    render();
  } catch (error) {
    renderMessages([`匯入失敗: ${error.message}`], []);
  } finally {
    elements.fileInput.value = "";
  }
});

elements.exportBtn.addEventListener("click", () => {
  download("devices.json", `${JSON.stringify(state, null, 2)}\n`, "application/json");
});

elements.addDeviceBtn.addEventListener("click", () => {
  state.devices.push(newDevice());
  selectedDeviceIndex = state.devices.length - 1;
  selectedOutputFile = "";
  render();
});

elements.duplicateDeviceBtn.addEventListener("click", () => {
  const clone = structuredClone(currentDevice());
  clone.hostname = `${clone.hostname || "DEVICE"}-COPY`;
  state.devices.splice(selectedDeviceIndex + 1, 0, clone);
  selectedDeviceIndex += 1;
  selectedOutputFile = "";
  render();
});

elements.deleteDeviceBtn.addEventListener("click", () => {
  if (state.devices.length <= 1) return;
  state.devices.splice(selectedDeviceIndex, 1);
  selectedDeviceIndex = Math.max(0, selectedDeviceIndex - 1);
  selectedOutputFile = "";
  render();
});

elements.deviceTab.addEventListener("click", () => {
  activeTab = "device";
  renderForms();
});

elements.defaultsTab.addEventListener("click", () => {
  activeTab = "defaults";
  renderForms();
});

elements.deviceForm.addEventListener("input", updateDeviceFromForm);
elements.deviceForm.addEventListener("change", (event) => {
  updateDeviceFromForm(event);
  updateRowFromEvent(event);
});
elements.deviceForm.addEventListener("input", updateRowFromEvent);
elements.defaultsForm.addEventListener("input", updateDefaultsFromForm);
elements.defaultsForm.addEventListener("change", updateDefaultsFromForm);

elements.deviceForm.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  if (target.dataset.action === "remove") removeRow(target.dataset.kind, Number(target.dataset.index));
});

elements.addVlanBtn.addEventListener("click", () => {
  currentDevice().vlans.push({ id: 10, name: "VLAN_NAME" });
  render();
});

elements.addInterfaceBtn.addEventListener("click", () => {
  currentDevice().interfaces.push({ name: "GigabitEthernet0/0", mode: "routed", address: "10.0.0.1/24" });
  render();
});

elements.addStaticRouteBtn.addEventListener("click", () => {
  const device = currentDevice();
  device.routing ||= {};
  device.routing.static ||= [];
  if (normalizedDeviceLayer(device) === "L2") {
    if (!device.routing.static.some((route) => route.destination === "0.0.0.0/0")) {
      device.routing.static.push({ destination: "0.0.0.0/0", next_hop: "10.0.0.254" });
    }
  } else {
    device.routing.static.push({ destination: "0.0.0.0/0", next_hop: "10.0.0.254" });
  }
  render();
});

elements.ospfEnabled.addEventListener("change", () => {
  const device = currentDevice();
  device.routing ||= {};
  if (elements.ospfEnabled.checked) {
    device.routing.ospf ||= { process_id: 1, router_id: "", networks: [] };
  } else {
    delete device.routing.ospf;
  }
  render();
});

elements.ospfProcessId.addEventListener("input", () => {
  currentDevice().routing.ospf.process_id = toNumber(elements.ospfProcessId.value, 1);
  renderOutput();
});

elements.ospfRouterId.addEventListener("input", () => {
  sanitizeTargetInput(elements.ospfRouterId);
  currentDevice().routing.ospf.router_id = elements.ospfRouterId.value.trim();
  renderOutput();
});

elements.addOspfNetworkBtn.addEventListener("click", () => {
  const device = currentDevice();
  device.routing ||= {};
  device.routing.ospf ||= { process_id: 1, router_id: "", networks: [] };
  device.routing.ospf.networks.push({ prefix: "10.0.0.0/24", area: 0 });
  render();
});

elements.eigrpEnabled.addEventListener("change", () => {
  const device = currentDevice();
  device.routing ||= {};
  if (elements.eigrpEnabled.checked) {
    device.routing.eigrp ||= { asn: 100, router_id: "", networks: [], passive_interfaces: [], no_auto_summary: true };
  } else {
    delete device.routing.eigrp;
  }
  render();
});

elements.eigrpAsn.addEventListener("input", () => {
  currentDevice().routing.eigrp.asn = toNumber(elements.eigrpAsn.value, 100);
  renderOutput();
});

elements.eigrpRouterId.addEventListener("input", () => {
  sanitizeTargetInput(elements.eigrpRouterId);
  currentDevice().routing.eigrp.router_id = elements.eigrpRouterId.value.trim();
  renderOutput();
});

elements.eigrpPassiveInterfaces.addEventListener("input", () => {
  sanitizeTargetInput(elements.eigrpPassiveInterfaces);
  currentDevice().routing.eigrp.passive_interfaces = splitList(elements.eigrpPassiveInterfaces.value);
  renderOutput();
});

elements.eigrpNoAutoSummary.addEventListener("change", () => {
  currentDevice().routing.eigrp.no_auto_summary = elements.eigrpNoAutoSummary.checked;
  renderOutput();
});

elements.addEigrpNetworkBtn.addEventListener("click", () => {
  const device = currentDevice();
  device.routing ||= {};
  device.routing.eigrp ||= { asn: 100, router_id: "", networks: [], passive_interfaces: [], no_auto_summary: true };
  device.routing.eigrp.networks.push({ prefix: "10.0.0.0/24" });
  render();
});

elements.bgpEnabled.addEventListener("change", () => {
  const device = currentDevice();
  device.routing ||= {};
  if (elements.bgpEnabled.checked) {
    device.routing.bgp ||= { asn: 65001, router_id: "", neighbors: [], networks: [] };
  } else {
    delete device.routing.bgp;
  }
  render();
});

elements.bgpAsn.addEventListener("input", () => {
  currentDevice().routing.bgp.asn = toNumber(elements.bgpAsn.value, 65001);
  renderOutput();
});

elements.bgpRouterId.addEventListener("input", () => {
  sanitizeTargetInput(elements.bgpRouterId);
  currentDevice().routing.bgp.router_id = elements.bgpRouterId.value.trim();
  renderOutput();
});

elements.addBgpNeighborBtn.addEventListener("click", () => {
  const device = currentDevice();
  device.routing ||= {};
  device.routing.bgp ||= { asn: 65001, router_id: "", neighbors: [], networks: [] };
  device.routing.bgp.neighbors.push({ address: "203.0.113.1", remote_as: 65000, description: "" });
  render();
});

elements.addBgpNetworkBtn.addEventListener("click", () => {
  const device = currentDevice();
  device.routing ||= {};
  device.routing.bgp ||= { asn: 65001, router_id: "", neighbors: [], networks: [] };
  device.routing.bgp.networks.push({ prefix: "203.0.113.0/30" });
  render();
});

elements.outputSelect.addEventListener("change", () => {
  selectedOutputFile = elements.outputSelect.value;
  renderOutput();
});

elements.copyConfigBtn.addEventListener("click", async () => {
  await copyText(elements.configOutput.value);
  elements.statusText.textContent = "已複製設定檔";
});

elements.downloadConfigBtn.addEventListener("click", () => {
  if (!selectedOutputFile) return;
  download(selectedOutputFile, elements.configOutput.value);
});

render();
