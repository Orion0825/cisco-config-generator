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
      spanning_tree: {
        mode: "rapid-pvst",
        vlan_priorities: [{ vlans: [10, 20, 99], priority: 4096 }],
      },
      acls: [
        {
          name: "INSIDE-NAT",
          type: "extended",
          entries: [{ action: "permit", protocol: "ip", source: "10.10.10.0/24", destination: "any" }],
        },
        {
          name: "WAN-IN",
          type: "extended",
          entries: [
            { remark: "Basic inbound WAN filter" },
            { action: "deny", protocol: "ip", source: "any", destination: "10.10.10.0/24", log: true },
            { action: "permit", protocol: "ip", source: "any", destination: "any" },
          ],
        },
      ],
      dhcp: {
        excluded_addresses: [{ start: "10.10.10.1", end: "10.10.10.20" }],
        pools: [
          {
            name: "USERS",
            network: "10.10.10.0/24",
            default_router: "10.10.10.1",
            dns_servers: ["1.1.1.1", "8.8.8.8"],
            domain_name: "lab.local",
          },
        ],
      },
      nat: {
        inside_source: [{ acl: "INSIDE-NAT", interface: "GigabitEthernet0/0", overload: true }],
      },
      vrfs: [
        {
          name: "CUST-A",
          rd: "65001:10",
          route_targets_import: ["65001:10"],
          route_targets_export: ["65001:10"],
        },
      ],
      prefix_lists: [{ name: "PL-CUST-A", sequence: 10, action: "permit", prefix: "10.10.0.0/16", ge: 24, le: 32 }],
      route_maps: [{ name: "RM-CUST-A-OUT", sequence: 10, action: "permit", match_prefix_lists: ["PL-CUST-A"], set_local_preference: 200 }],
      interfaces: [
        {
          name: "GigabitEthernet0/0",
          description: "WAN uplink",
          mode: "routed",
          address: "203.0.113.2/30",
          nat_role: "outside",
          access_groups: [{ name: "WAN-IN", direction: "in" }],
        },
        {
          name: "GigabitEthernet0/1",
          description: "LAN trunk to access switch",
          mode: "trunk",
          native_vlan: 99,
          allowed_vlans: [10, 20, 99],
          channel_group: 1,
          channel_mode: "active",
        },
        {
          name: "Port-channel1",
          description: "LAN port-channel",
          mode: "trunk",
          native_vlan: 99,
          allowed_vlans: [10, 20, 99],
        },
        {
          name: "Vlan10",
          description: "Users gateway",
          mode: "svi",
          address: "10.10.10.2/24",
          vrf: "CUST-A",
          nat_role: "inside",
          helper_addresses: ["10.10.10.10"],
          hsrp: [{ group: 10, virtual_ip: "10.10.10.1", priority: 110, preempt: true }],
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
          redistribute: [{ source: "connected", subnets: true, route_map: "RM-CUST-A-OUT" }],
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
          neighbors: [
            {
              address: "203.0.113.1",
              remote_as: 65000,
              description: "ISP edge",
              route_map_out: "RM-CUST-A-OUT",
              next_hop_self: true,
              send_community: "both",
            },
          ],
          networks: [{ prefix: "203.0.113.0/30" }],
        },
      },
    },
    {
      hostname: "ACCESS-SW1",
      role: "access-switch",
      device_layer: "L2",
      platform: "ios",
      spanning_tree: { mode: "rapid-pvst", portfast_default: true, bpduguard_default: true },
      vlans: [
        { id: 10, name: "USERS" },
        { id: 20, name: "VOICE" },
        { id: 99, name: "MGMT" },
      ],
      interfaces: [
        {
          name: "Port-channel1",
          description: "Uplink port-channel",
          mode: "trunk",
          native_vlan: 99,
          allowed_vlans: [10, 20, 99],
        },
        { name: "Vlan99", description: "Management SVI", mode: "svi", address: "10.99.0.11/24" },
        {
          name: "GigabitEthernet1/0/1",
          description: "Uplink to BRANCH-R1",
          mode: "trunk",
          native_vlan: 99,
          allowed_vlans: [10, 20, 99],
          channel_group: 1,
          channel_mode: "active",
        },
        {
          name: "GigabitEthernet1/0/10",
          description: "User desk",
          mode: "access",
          access_vlan: 10,
          voice_vlan: 20,
          spanning_tree_portfast: true,
          spanning_tree_bpduguard: true,
          port_security: { maximum: 2, violation: "restrict", sticky: true },
        },
      ],
      routing: {
        static: [{ destination: "0.0.0.0/0", next_hop: "10.99.0.1" }],
      },
    },
  ],
};

const DEVICE_LAYERS = new Set(["L2", "L3"]);
const ACL_TYPES = new Set(["standard", "extended"]);
const ACL_ACTIONS = new Set(["permit", "deny"]);
const CHANNEL_MODES = new Set(["active", "passive", "on", "auto", "desirable"]);
const NAT_ROLES = new Set(["inside", "outside"]);
const PORT_SECURITY_VIOLATIONS = new Set(["protect", "restrict", "shutdown"]);
const STP_MODES = new Set(["pvst", "rapid-pvst", "mst"]);
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
let uploadedConfigs = {};
let uploadWarnings = [];

const elements = {
  statusText: document.querySelector("#statusText"),
  statDevices: document.querySelector("#statDevices"),
  statL2: document.querySelector("#statL2"),
  statL3: document.querySelector("#statL3"),
  statRouting: document.querySelector("#statRouting"),
  introEditBtn: document.querySelector("#introEditBtn"),
  introOutputBtn: document.querySelector("#introOutputBtn"),
  introCopyBtn: document.querySelector("#introCopyBtn"),
  fileInput: document.querySelector("#fileInput"),
  configFileInput: document.querySelector("#configFileInput"),
  importBtn: document.querySelector("#importBtn"),
  uploadConfigBtn: document.querySelector("#uploadConfigBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  addDeviceBtn: document.querySelector("#addDeviceBtn"),
  duplicateDeviceBtn: document.querySelector("#duplicateDeviceBtn"),
  deleteDeviceBtn: document.querySelector("#deleteDeviceBtn"),
  deviceCount: document.querySelector("#deviceCount"),
  deviceList: document.querySelector("#deviceList"),
  deviceTab: document.querySelector("#deviceTab"),
  advancedTab: document.querySelector("#advancedTab"),
  defaultsTab: document.querySelector("#defaultsTab"),
  editorPanel: document.querySelector(".editor-panel"),
  outputPanel: document.querySelector(".output-panel"),
  deviceForm: document.querySelector("#deviceForm"),
  advancedForm: document.querySelector("#advancedForm"),
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
  ospfRedistributeSources: document.querySelector("#ospfRedistributeSources"),
  ospfRedistributeRouteMap: document.querySelector("#ospfRedistributeRouteMap"),
  ospfNetworkRows: document.querySelector("#ospfNetworkRows"),
  eigrpSection: document.querySelector("#eigrpSection"),
  eigrpEnabled: document.querySelector("#eigrpEnabled"),
  eigrpFields: document.querySelector("#eigrpFields"),
  eigrpAsn: document.querySelector("#eigrpAsn"),
  eigrpRouterId: document.querySelector("#eigrpRouterId"),
  eigrpPassiveInterfaces: document.querySelector("#eigrpPassiveInterfaces"),
  eigrpRedistributeSources: document.querySelector("#eigrpRedistributeSources"),
  eigrpRedistributeMetric: document.querySelector("#eigrpRedistributeMetric"),
  eigrpRedistributeRouteMap: document.querySelector("#eigrpRedistributeRouteMap"),
  eigrpNoAutoSummary: document.querySelector("#eigrpNoAutoSummary"),
  eigrpNetworkRows: document.querySelector("#eigrpNetworkRows"),
  bgpSection: document.querySelector("#bgpSection"),
  bgpEnabled: document.querySelector("#bgpEnabled"),
  bgpFields: document.querySelector("#bgpFields"),
  bgpAsn: document.querySelector("#bgpAsn"),
  bgpRouterId: document.querySelector("#bgpRouterId"),
  bgpRedistributeSources: document.querySelector("#bgpRedistributeSources"),
  bgpRedistributeRouteMap: document.querySelector("#bgpRedistributeRouteMap"),
  bgpNeighborRows: document.querySelector("#bgpNeighborRows"),
  bgpNetworkRows: document.querySelector("#bgpNetworkRows"),
  vrfRows: document.querySelector("#vrfRows"),
  prefixListRows: document.querySelector("#prefixListRows"),
  routeMapRows: document.querySelector("#routeMapRows"),
  stpMode: document.querySelector("#stpMode"),
  stpPortfastDefault: document.querySelector("#stpPortfastDefault"),
  stpBpduguardDefault: document.querySelector("#stpBpduguardDefault"),
  stpPriorityRows: document.querySelector("#stpPriorityRows"),
  dhcpExcludedRows: document.querySelector("#dhcpExcludedRows"),
  dhcpPoolRows: document.querySelector("#dhcpPoolRows"),
  aclRows: document.querySelector("#aclRows"),
  aclEntryRows: document.querySelector("#aclEntryRows"),
  natRows: document.querySelector("#natRows"),
  addVlanBtn: document.querySelector("#addVlanBtn"),
  addInterfaceBtn: document.querySelector("#addInterfaceBtn"),
  addStaticRouteBtn: document.querySelector("#addStaticRouteBtn"),
  addOspfNetworkBtn: document.querySelector("#addOspfNetworkBtn"),
  addEigrpNetworkBtn: document.querySelector("#addEigrpNetworkBtn"),
  addBgpNeighborBtn: document.querySelector("#addBgpNeighborBtn"),
  addBgpNetworkBtn: document.querySelector("#addBgpNetworkBtn"),
  addVrfBtn: document.querySelector("#addVrfBtn"),
  addPrefixListBtn: document.querySelector("#addPrefixListBtn"),
  addRouteMapBtn: document.querySelector("#addRouteMapBtn"),
  addStpPriorityBtn: document.querySelector("#addStpPriorityBtn"),
  addDhcpExcludedBtn: document.querySelector("#addDhcpExcludedBtn"),
  addDhcpPoolBtn: document.querySelector("#addDhcpPoolBtn"),
  addAclBtn: document.querySelector("#addAclBtn"),
  addAclEntryBtn: document.querySelector("#addAclEntryBtn"),
  addNatRuleBtn: document.querySelector("#addNatRuleBtn"),
  outputCount: document.querySelector("#outputCount"),
  outputSelect: document.querySelector("#outputSelect"),
  configDropZone: document.querySelector("#configDropZone"),
  configOutput: document.querySelector("#configOutput"),
  copyConfigBtn: document.querySelector("#copyConfigBtn"),
  downloadConfigBtn: document.querySelector("#downloadConfigBtn"),
  clearUploadedBtn: document.querySelector("#clearUploadedBtn"),
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
    const rawLayer = String(device.device_layer || "L3").toUpperCase();
    if (DEVICE_LAYERS.has(rawLayer)) device.device_layer = rawLayer;
    device.vlans ||= [];
    device.interfaces ||= [];
    device.vrfs ||= [];
    device.prefix_lists ||= [];
    device.route_maps ||= [];
    device.route_maps.forEach((routeMap) => {
      routeMap.match_prefix_lists ||= [];
    });
    device.acls ||= [];
    device.acls.forEach((acl) => {
      acl.entries ||= [];
      acl.type ||= "extended";
    });
    device.dhcp ||= {};
    device.dhcp.excluded_addresses ||= [];
    device.dhcp.pools ||= [];
    device.nat ||= {};
    device.nat.inside_source ||= [];
    if (device.spanning_tree) device.spanning_tree.vlan_priorities ||= [];
    device.routing ||= {};
    device.routing.static ||= [];
    if (device.routing.ospf) {
      device.routing.ospf.networks ||= [];
      device.routing.ospf.redistribute ||= [];
    }
    if (device.routing.eigrp) {
      device.routing.eigrp.networks ||= [];
      device.routing.eigrp.passive_interfaces ||= [];
      device.routing.eigrp.redistribute ||= [];
      device.routing.eigrp.no_auto_summary ??= true;
    }
    if (device.routing.bgp) {
      device.routing.bgp.neighbors ||= [];
      device.routing.bgp.networks ||= [];
      device.routing.bgp.redistribute ||= [];
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
  renderSummary();
  renderDeviceList();
  renderForms();
  renderOutput();
}

function renderSummary() {
  const devices = state.devices || [];
  const l2Count = devices.filter((device) => normalizedDeviceLayer(device) === "L2").length;
  const l3Count = devices.length - l2Count;
  const routingCount = devices.reduce((total, device) => total + enabledDynamicProtocols(device).length, 0);
  elements.statDevices.textContent = String(devices.length);
  elements.statL2.textContent = String(l2Count);
  elements.statL3.textContent = String(l3Count);
  elements.statRouting.textContent = String(routingCount);
}

function renderDeviceList() {
  elements.deviceCount.textContent = String(state.devices.length);
  elements.deviceList.innerHTML = "";

  state.devices.forEach((device, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `device-item${index === selectedDeviceIndex ? " active" : ""}`;
    const layer = normalizedDeviceLayer(device);
    const tags = deviceTags(device);
    button.innerHTML = `
      <span class="device-title">
        <span>${escapeHtml(device.hostname || "未命名設備")}</span>
        <strong class="layer-chip ${layer.toLowerCase()}">${escapeHtml(layer)}</strong>
      </span>
      <span class="device-meta">${escapeHtml(device.role || device.platform || "ios")}</span>
      <span class="device-badges">${tags.map((tag) => `<span class="protocol-badge ${tag.toLowerCase()}">${escapeHtml(tag)}</span>`).join("")}</span>
    `;
    button.addEventListener("click", () => {
      selectedDeviceIndex = index;
      selectedOutputFile = "";
      render();
    });
    elements.deviceList.appendChild(button);
  });
}

function enabledDynamicProtocols(device) {
  const routing = device.routing || {};
  return ["ospf", "eigrp", "bgp"].filter((protocol) => routing[protocol]);
}

function deviceTags(device) {
  const routing = device.routing || {};
  const tags = [];
  if ((routing.static || []).length) tags.push(normalizedDeviceLayer(device) === "L2" ? "Gateway" : "Static");
  enabledDynamicProtocols(device).forEach((protocol) => tags.push(protocol.toUpperCase()));
  if (hasSpanningTreeConfig(device.spanning_tree)) tags.push("STP");
  if (device.acls?.length) tags.push("ACL");
  if (device.vrfs?.length) tags.push("VRF");
  if (device.prefix_lists?.length || device.route_maps?.length) tags.push("Policy");
  if (hasNatConfig(device.nat)) tags.push("NAT");
  if (hasDhcpConfig(device.dhcp)) tags.push("DHCP");
  if ((device.interfaces || []).some((iface) => iface.hsrp?.length)) tags.push("HSRP");
  if ((device.interfaces || []).some((iface) => iface.channel_group)) tags.push("LAG");
  if ((device.interfaces || []).some((iface) => iface.port_security)) tags.push("PortSec");
  return tags;
}

function accessGroupName(iface, direction) {
  return (iface.access_groups || []).find((item) => item.direction === direction)?.name || "";
}

function renderForms() {
  elements.deviceTab.classList.toggle("active", activeTab === "device");
  elements.advancedTab.classList.toggle("active", activeTab === "advanced");
  elements.defaultsTab.classList.toggle("active", activeTab === "defaults");
  elements.deviceForm.classList.toggle("hidden", activeTab !== "device");
  elements.advancedForm.classList.toggle("hidden", activeTab !== "advanced");
  elements.defaultsForm.classList.toggle("hidden", activeTab !== "defaults");
  renderDeviceForm();
  renderAdvancedForm();
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
      field("VRF", "vrf", item.vrf || "", "text", "span-2 mode-l3"),
      selectField("NAT", "nat_role", item.nat_role || "", ["", "inside", "outside"], "span-2 mode-l3"),
      field("Helper", "helper_addresses", (item.helper_addresses || []).join(","), "text", "span-3 mode-l3"),
      field("HSRP Group", "hsrp_group", item.hsrp?.[0]?.group ?? "", "number", "span-2 mode-l3", { min: 0, max: 255 }),
      field("HSRP VIP", "hsrp_virtual_ip", item.hsrp?.[0]?.virtual_ip || "", "text", "span-3 mode-l3"),
      field("HSRP Priority", "hsrp_priority", item.hsrp?.[0]?.priority ?? "", "number", "span-2 mode-l3", { min: 1, max: 255 }),
      checkboxField("HSRP Preempt", "hsrp_preempt", !!item.hsrp?.[0]?.preempt, "span-2 mode-l3"),
      field("ACL In", "access_group_in", accessGroupName(item, "in"), "text", "span-3 mode-l3"),
      field("ACL Out", "access_group_out", accessGroupName(item, "out"), "text", "span-3 mode-l3"),
      field("Access VLAN", "access_vlan", item.access_vlan ?? "", "number", "span-2 mode-access", { min: 1, max: 4094 }),
      field("Voice VLAN", "voice_vlan", item.voice_vlan ?? "", "number", "span-2 mode-access", { min: 1, max: 4094 }),
      field("Native VLAN", "native_vlan", item.native_vlan ?? "", "number", "span-2 mode-trunk", { min: 1, max: 4094 }),
      field("Allowed VLANs", "allowed_vlans", (item.allowed_vlans || []).join(","), "text", "span-4 mode-trunk"),
      field("Channel", "channel_group", item.channel_group ?? "", "number", "span-2", { min: 1 }),
      selectField("LACP", "channel_mode", item.channel_mode || "active", ["active", "passive", "on", "auto", "desirable"], "span-2"),
      field("PortSec Max", "port_security_maximum", item.port_security?.maximum ?? "", "number", "span-2 mode-access", { min: 1 }),
      selectField("Violation", "port_security_violation", item.port_security?.violation || "restrict", ["protect", "restrict", "shutdown"], "span-2 mode-access"),
      checkboxField("Sticky", "port_security_sticky", !!item.port_security?.sticky, "span-2 mode-access"),
      checkboxField("Portfast", "spanning_tree_portfast", !!item.spanning_tree_portfast, "span-2 mode-access"),
      checkboxField("BPDU Guard", "spanning_tree_bpduguard", !!item.spanning_tree_bpduguard, "span-2 mode-access"),
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
      field("Destination", "destination", route.destination || "", "text", "span-4"),
      field("Next Hop", "next_hop", route.next_hop || "", "text", "span-4"),
      field("VRF", "vrf", route.vrf || "", "text", "span-2"),
    ]));
  });

  elements.ospfSection.classList.toggle("hidden", isL2);
  const ospf = isL2 ? undefined : device.routing?.ospf;
  elements.ospfEnabled.checked = !!ospf;
  elements.ospfFields.classList.toggle("hidden", !ospf);
  elements.ospfProcessId.value = ospf?.process_id ?? 1;
  elements.ospfRouterId.value = ospf?.router_id || "";
  elements.ospfRedistributeSources.value = redistributeSources(ospf?.redistribute || []);
  elements.ospfRedistributeRouteMap.value = ospf?.redistribute?.[0]?.route_map || "";
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
  elements.eigrpRedistributeSources.value = redistributeSources(eigrp?.redistribute || []);
  elements.eigrpRedistributeMetric.value = eigrp?.redistribute?.[0]?.metric || "";
  elements.eigrpRedistributeRouteMap.value = eigrp?.redistribute?.[0]?.route_map || "";
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
  elements.bgpRedistributeSources.value = redistributeSources(bgp?.redistribute || []);
  elements.bgpRedistributeRouteMap.value = bgp?.redistribute?.[0]?.route_map || "";
  elements.bgpNeighborRows.innerHTML = "";
  (bgp?.neighbors || []).forEach((neighbor, index) => {
    elements.bgpNeighborRows.appendChild(rowElement("bgpNeighbor", index, [
      field("Address", "address", neighbor.address || "", "text", "span-3"),
      field("Remote ASN", "remote_as", neighbor.remote_as ?? "", "number", "span-2", { min: 1 }),
      field("Description", "description", neighbor.description || "", "text", "span-2"),
      field("Update Source", "update_source", neighbor.update_source || "", "text", "span-2"),
      field("RM In", "route_map_in", neighbor.route_map_in || "", "text", "span-2"),
      field("RM Out", "route_map_out", neighbor.route_map_out || "", "text", "span-2"),
      field("PL In", "prefix_list_in", neighbor.prefix_list_in || "", "text", "span-2"),
      field("PL Out", "prefix_list_out", neighbor.prefix_list_out || "", "text", "span-2"),
      checkboxField("NH Self", "next_hop_self", !!neighbor.next_hop_self, "span-2"),
      selectField("Send Comm", "send_community", neighbor.send_community || "", ["", "standard", "extended", "both"], "span-2"),
      checkboxField("Soft Reconfig", "soft_reconfiguration", !!neighbor.soft_reconfiguration, "span-2"),
    ]));
  });
  elements.bgpNetworkRows.innerHTML = "";
  (bgp?.networks || []).forEach((network, index) => {
    elements.bgpNetworkRows.appendChild(rowElement("bgpNetwork", index, [
      field("Prefix", "prefix", network.prefix || "", "text", "span-10"),
    ]));
  });
}

function renderAdvancedForm() {
  const device = currentDevice();
  elements.vrfRows.innerHTML = "";
  (device.vrfs || []).forEach((vrf, index) => {
    elements.vrfRows.appendChild(rowElement("vrf", index, [
      field("Name", "name", vrf.name || "", "text", "span-3"),
      field("RD", "rd", vrf.rd || "", "text", "span-3"),
      field("Import RT", "route_targets_import", (vrf.route_targets_import || []).join(","), "text", "span-3"),
      field("Export RT", "route_targets_export", (vrf.route_targets_export || []).join(","), "text", "span-3"),
    ]));
  });

  elements.prefixListRows.innerHTML = "";
  (device.prefix_lists || []).forEach((item, index) => {
    elements.prefixListRows.appendChild(rowElement("prefixList", index, [
      field("Name", "name", item.name || "", "text", "span-3"),
      field("Seq", "sequence", item.sequence ?? 10, "number", "span-1", { min: 1 }),
      selectField("Action", "action", item.action || "permit", ["permit", "deny"], "span-2"),
      field("Prefix", "prefix", item.prefix || "", "text", "span-3"),
      field("GE", "ge", item.ge ?? "", "number", "span-1", { min: 0, max: 32 }),
      field("LE", "le", item.le ?? "", "number", "span-1", { min: 0, max: 32 }),
    ]));
  });

  elements.routeMapRows.innerHTML = "";
  (device.route_maps || []).forEach((item, index) => {
    elements.routeMapRows.appendChild(rowElement("routeMap", index, [
      field("Name", "name", item.name || "", "text", "span-3"),
      field("Seq", "sequence", item.sequence ?? 10, "number", "span-1", { min: 0 }),
      selectField("Action", "action", item.action || "permit", ["permit", "deny"], "span-2"),
      field("Match PL", "match_prefix_lists", (item.match_prefix_lists || []).join(","), "text", "span-3"),
      field("LocalPref", "set_local_preference", item.set_local_preference ?? "", "number", "span-2", { min: 0 }),
      field("Metric", "set_metric", item.set_metric || "", "text", "span-2"),
      field("AS Prepend", "set_as_path_prepend", item.set_as_path_prepend || "", "text", "span-3"),
    ]));
  });

  const stp = device.spanning_tree || {};
  elements.stpMode.value = stp.mode || "";
  elements.stpPortfastDefault.checked = !!stp.portfast_default;
  elements.stpBpduguardDefault.checked = !!stp.bpduguard_default;
  elements.stpPriorityRows.innerHTML = "";
  (stp.vlan_priorities || []).forEach((item, index) => {
    elements.stpPriorityRows.appendChild(rowElement("stpPriority", index, [
      field("VLANs", "vlans", (item.vlans || []).join(","), "text", "span-5"),
      field("Priority", "priority", item.priority ?? 4096, "number", "span-3", { min: 0, max: 61440, step: 4096 }),
    ]));
  });

  const dhcp = device.dhcp || {};
  elements.dhcpExcludedRows.innerHTML = "";
  (dhcp.excluded_addresses || []).forEach((item, index) => {
    const row = typeof item === "string" ? { start: item, end: "" } : item;
    elements.dhcpExcludedRows.appendChild(rowElement("dhcpExcluded", index, [
      field("Start", "start", row.start || "", "text", "span-5"),
      field("End", "end", row.end || "", "text", "span-5"),
    ]));
  });
  elements.dhcpPoolRows.innerHTML = "";
  (dhcp.pools || []).forEach((pool, index) => {
    elements.dhcpPoolRows.appendChild(rowElement("dhcpPool", index, [
      field("Name", "name", pool.name || "", "text", "span-2"),
      field("Network", "network", pool.network || "", "text", "span-3"),
      field("Gateway", "default_router", pool.default_router || "", "text", "span-3"),
      field("DNS", "dns_servers", (pool.dns_servers || []).join(","), "text", "span-3"),
      field("Domain", "domain_name", pool.domain_name || "", "text", "span-3"),
    ]));
  });

  elements.aclRows.innerHTML = "";
  (device.acls || []).forEach((acl, index) => {
    elements.aclRows.appendChild(rowElement("acl", index, [
      field("Name", "name", acl.name || "", "text", "span-4"),
      selectField("Type", "type", acl.type || "extended", ["standard", "extended"], "span-3"),
    ]));
  });
  elements.aclEntryRows.innerHTML = "";
  (device.acls || []).forEach((acl, aclIndex) => {
    (acl.entries || []).forEach((entry, entryIndex) => {
      elements.aclEntryRows.appendChild(rowElement("aclEntry", entryIndex, [
        field("ACL", "acl_name", acl.name || "", "text", "span-2"),
        field("Remark", "remark", entry.remark || "", "text", "span-3"),
        selectField("Action", "action", entry.action || "permit", ["permit", "deny"], "span-2"),
        field("Protocol", "protocol", entry.protocol || "ip", "text", "span-2"),
        field("Source", "source", entry.source || "any", "text", "span-3"),
        field("Destination", "destination", entry.destination || "any", "text", "span-3"),
        field("Port", "destination_port", entry.destination_port || "", "text", "span-2"),
        checkboxField("Log", "log", !!entry.log, "span-2"),
      ], { aclIndex }));
    });
  });

  elements.natRows.innerHTML = "";
  (device.nat?.inside_source || []).forEach((item, index) => {
    elements.natRows.appendChild(rowElement("natRule", index, [
      field("ACL", "acl", item.acl || "", "text", "span-4"),
      field("Interface", "interface", item.interface || "", "text", "span-4"),
      checkboxField("Overload", "overload", item.overload !== false, "span-2"),
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
  const generatedFiles = Object.keys(result.configs);
  const uploadedFiles = Object.keys(uploadedConfigs);
  const configs = { ...result.configs, ...uploadedConfigs };
  const files = [...generatedFiles, ...uploadedFiles];
  selectedOutputFile = selectedOutputFile && configs[selectedOutputFile] ? selectedOutputFile : files[0] || "";
  elements.outputSelect.innerHTML = "";

  const addOption = (container, filename, source) => {
    const option = document.createElement("option");
    option.value = filename;
    option.textContent = `${filename} - ${source}`;
    container.appendChild(option);
  };

  if (generatedFiles.length) {
    const group = document.createElement("optgroup");
    group.label = "產生器輸出";
    generatedFiles.forEach((filename) => addOption(group, filename, "產生"));
    elements.outputSelect.appendChild(group);
  }

  if (uploadedFiles.length) {
    const group = document.createElement("optgroup");
    group.label = "上傳檔案";
    uploadedFiles.forEach((filename) => addOption(group, filename, "上傳"));
    elements.outputSelect.appendChild(group);
  }

  elements.outputSelect.value = selectedOutputFile;
  elements.configOutput.value = configs[selectedOutputFile] || "";
  elements.outputCount.textContent = String(files.length);
  if (result.errors.length) {
    elements.statusText.textContent = "設定檔需要修正";
  } else if (uploadedFiles.length) {
    elements.statusText.textContent = `已產生 ${generatedFiles.length} 份，另上傳 ${uploadedFiles.length} 份 CFG/TXT`;
  } else {
    elements.statusText.textContent = `已產生 ${generatedFiles.length} 份設定檔`;
  }
  renderMessages(result.errors, [...result.warnings, ...uploadWarnings]);
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

function rowElement(kind, index, fields, extra = {}) {
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.kind = kind;
  row.dataset.index = String(index);
  Object.entries(extra).forEach(([key, value]) => {
    row.dataset[key] = String(value);
  });
  fields.forEach((item) => row.appendChild(item));

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "row-action danger";
  remove.dataset.action = "remove";
  remove.dataset.kind = kind;
  remove.dataset.index = String(index);
  Object.entries(extra).forEach(([key, value]) => {
    remove.dataset[key] = String(value);
  });
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

function updateInterfaceHsrp(iface, key, value) {
  if (value === "" && !["hsrp_preempt"].includes(key)) {
    if (!iface.hsrp?.[0]) return;
  }
  iface.hsrp ||= [{}];
  const group = iface.hsrp[0];
  if (key === "hsrp_group") group.group = toNumber(value, "");
  if (key === "hsrp_virtual_ip") group.virtual_ip = String(value).trim();
  if (key === "hsrp_priority") {
    if (value === "") delete group.priority;
    else group.priority = toNumber(value, value);
  }
  if (key === "hsrp_preempt") group.preempt = !!value;
  if (!group.group && !group.virtual_ip && !group.priority && !group.preempt) delete iface.hsrp;
}

function updateInterfaceAccessGroup(iface, direction, value) {
  iface.access_groups ||= [];
  const existing = iface.access_groups.find((item) => item.direction === direction);
  if (!value) {
    iface.access_groups = iface.access_groups.filter((item) => item.direction !== direction);
    if (!iface.access_groups.length) delete iface.access_groups;
    return;
  }
  if (existing) existing.name = String(value).trim();
  else iface.access_groups.push({ name: String(value).trim(), direction });
}

function updateInterfacePortSecurity(iface, key, value) {
  iface.port_security ||= {};
  if (key === "port_security_maximum") {
    if (value === "") delete iface.port_security.maximum;
    else iface.port_security.maximum = toNumber(value, value);
  }
  if (key === "port_security_violation") iface.port_security.violation = String(value);
  if (key === "port_security_sticky") iface.port_security.sticky = !!value;
  if (!iface.port_security.maximum && !iface.port_security.violation && !iface.port_security.sticky) delete iface.port_security;
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
  else if (["update_source", "interface"].includes(key)) cleaned = original.replace(SANITIZE_RULES.interface, "");
  else if (["address", "destination", "next_hop", "prefix", "helper_addresses", "hsrp_virtual_ip", "start", "end", "network", "default_router", "source", "ospfRouterId", "eigrpRouterId", "bgpRouterId"].includes(key)) cleaned = original.replace(SANITIZE_RULES.ipList, "");
  else if (["dns_servers", "vlans"].includes(key)) cleaned = original.replace(SANITIZE_RULES.ipList, "");
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

function updateAdvancedFromEvent(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  const device = currentDevice();
  const advancedIds = new Set(["stpMode", "stpPortfastDefault", "stpBpduguardDefault"]);
  if (!advancedIds.has(target.id)) return;

  device.spanning_tree ||= {};
  if (target.id === "stpMode") {
    if (target.value) device.spanning_tree.mode = target.value;
    else delete device.spanning_tree.mode;
  }
  if (target.id === "stpPortfastDefault") device.spanning_tree.portfast_default = target.checked;
  if (target.id === "stpBpduguardDefault") device.spanning_tree.bpduguard_default = target.checked;

  const stp = device.spanning_tree;
  if (!stp.mode && !stp.portfast_default && !stp.bpduguard_default && !(stp.vlan_priorities || []).length) {
    delete device.spanning_tree;
  }
  renderDeviceList();
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
    } else if (key === "helper_addresses") {
      iface[key] = splitList(value);
    } else if (["access_vlan", "voice_vlan", "native_vlan", "channel_group"].includes(key)) {
      if (value === "") delete iface[key];
      else iface[key] = toNumber(value, value);
    } else if (["hsrp_group", "hsrp_virtual_ip", "hsrp_priority", "hsrp_preempt"].includes(key)) {
      updateInterfaceHsrp(iface, key, value);
    } else if (["access_group_in", "access_group_out"].includes(key)) {
      updateInterfaceAccessGroup(iface, key === "access_group_in" ? "in" : "out", value);
    } else if (["port_security_maximum", "port_security_violation", "port_security_sticky"].includes(key)) {
      updateInterfacePortSecurity(iface, key, value);
    } else if (["nat_role", "vrf"].includes(key)) {
      if (value === "") delete iface[key];
      else iface[key] = String(value).trim();
    } else if (["shutdown", "spanning_tree_portfast", "spanning_tree_bpduguard"].includes(key)) {
      iface[key] = value;
    } else {
      iface[key] = String(value).trim();
    }
    if (key === "mode") updateInterfaceVisibility(row, value);
  }
  if (kind === "static") {
    if (key === "vrf" && value === "") delete device.routing.static[index][key];
    else device.routing.static[index][key] = value.trim();
  }
  if (kind === "ospfNetwork") {
    device.routing.ospf.networks[index][key] = key === "area" ? toNumber(value, 0) : value.trim();
  }
  if (kind === "eigrpNetwork") {
    device.routing.eigrp.networks[index][key] = value.trim();
  }
  if (kind === "bgpNeighbor") {
    const neighbor = device.routing.bgp.neighbors[index];
    if (["next_hop_self", "soft_reconfiguration"].includes(key)) neighbor[key] = value;
    else if (key === "remote_as") neighbor[key] = toNumber(value, value);
    else if (value === "") delete neighbor[key];
    else neighbor[key] = value.trim();
  }
  if (kind === "bgpNetwork") {
    device.routing.bgp.networks[index][key] = value.trim();
  }
  if (kind === "stpPriority") {
    device.spanning_tree ||= {};
    device.spanning_tree.vlan_priorities ||= [];
    const item = device.spanning_tree.vlan_priorities[index];
    item[key] = key === "vlans" ? splitList(value).map((vlan) => toNumber(vlan, vlan)) : toNumber(value, 4096);
  }
  if (kind === "dhcpExcluded") {
    device.dhcp ||= {};
    device.dhcp.excluded_addresses ||= [];
    const item = normalizeExcludedAddress(device.dhcp.excluded_addresses[index]);
    item[key] = value.trim();
    device.dhcp.excluded_addresses[index] = item;
  }
  if (kind === "dhcpPool") {
    device.dhcp ||= {};
    device.dhcp.pools ||= [];
    const pool = device.dhcp.pools[index];
    pool[key] = key === "dns_servers" ? splitList(value) : value.trim();
  }
  if (kind === "acl") {
    device.acls ||= [];
    device.acls[index][key] = value.trim();
  }
  if (kind === "aclEntry") {
    const aclIndex = Number(row.dataset.aclIndex);
    const acl = device.acls[aclIndex];
    const entry = acl.entries[index];
    if (key === "acl_name") acl.name = value.trim();
    else if (["log"].includes(key)) entry[key] = value;
    else if (value === "") delete entry[key];
    else entry[key] = value.trim();
  }
  if (kind === "natRule") {
    device.nat ||= {};
    device.nat.inside_source ||= [];
    const item = device.nat.inside_source[index];
    if (key === "overload") item[key] = value;
    else item[key] = value.trim();
  }
  if (kind === "vrf") {
    device.vrfs ||= [];
    const vrf = device.vrfs[index];
    if (["route_targets_import", "route_targets_export"].includes(key)) vrf[key] = splitList(value);
    else vrf[key] = value.trim();
  }
  if (kind === "prefixList") {
    device.prefix_lists ||= [];
    const item = device.prefix_lists[index];
    if (["sequence", "ge", "le"].includes(key)) {
      if (value === "") delete item[key];
      else item[key] = toNumber(value, value);
    } else {
      item[key] = value.trim();
    }
  }
  if (kind === "routeMap") {
    device.route_maps ||= [];
    const item = device.route_maps[index];
    if (key === "match_prefix_lists") item[key] = splitList(value);
    else if (["sequence", "set_local_preference"].includes(key)) {
      if (value === "") delete item[key];
      else item[key] = toNumber(value, value);
    } else if (value === "") {
      delete item[key];
    } else {
      item[key] = value.trim();
    }
  }
  renderOutput();
}

function removeRow(kind, index, meta = {}) {
  const device = currentDevice();
  if (kind === "vlan") device.vlans.splice(index, 1);
  if (kind === "interface") device.interfaces.splice(index, 1);
  if (kind === "static") device.routing.static.splice(index, 1);
  if (kind === "ospfNetwork") device.routing.ospf.networks.splice(index, 1);
  if (kind === "eigrpNetwork") device.routing.eigrp.networks.splice(index, 1);
  if (kind === "bgpNeighbor") device.routing.bgp.neighbors.splice(index, 1);
  if (kind === "bgpNetwork") device.routing.bgp.networks.splice(index, 1);
  if (kind === "vrf") device.vrfs.splice(index, 1);
  if (kind === "prefixList") device.prefix_lists.splice(index, 1);
  if (kind === "routeMap") device.route_maps.splice(index, 1);
  if (kind === "stpPriority") device.spanning_tree.vlan_priorities.splice(index, 1);
  if (kind === "dhcpExcluded") device.dhcp.excluded_addresses.splice(index, 1);
  if (kind === "dhcpPool") device.dhcp.pools.splice(index, 1);
  if (kind === "acl") device.acls.splice(index, 1);
  if (kind === "aclEntry") {
    const aclIndex = Number(meta.aclIndex || 0);
    device.acls[aclIndex].entries.splice(index, 1);
  }
  if (kind === "natRule") device.nat.inside_source.splice(index, 1);
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
  add("! cisco編輯器byOrion");
  add("! Cisco CLI 可複製貼上區 START");
  add("! 以下內容可直接貼到 Console / SSH");
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
  renderVrfs(lines, device.vrfs || []);
  renderSpanningTree(lines, device.spanning_tree || {});
  renderDhcp(lines, device.dhcp || {});
  renderAcls(lines, device.acls || []);
  renderPrefixLists(lines, device.prefix_lists || []);
  renderRouteMaps(lines, device.route_maps || []);
  [...(device.vlans || [])]
    .sort((a, b) => Number(a.id) - Number(b.id))
    .forEach((vlan) => {
      add(`vlan ${Number(vlan.id)}`);
      if (vlan.name) add(` name ${vlan.name}`);
      add("!");
    });

  (device.interfaces || []).forEach((iface) => renderInterface(lines, iface));
  renderNat(lines, device.nat || {});
  renderRouting(lines, device.routing || {}, layer);
  add("line vty 0 4");
  add(users.length ? " login local" : " no login");
  add(` transport input ${device.vty?.transport || defaults.vty?.transport || "ssh"}`);
  add("!");
  add("end");
  return `${lines.join("\n").trimEnd()}\n`;
}

function renderVrfs(lines, vrfs) {
  vrfs.forEach((vrf) => {
    lines.push(`ip vrf ${required(vrf.name, "vrf name")}`);
    if (vrf.rd) lines.push(` rd ${vrf.rd}`);
    (vrf.route_targets_import || []).forEach((target) => lines.push(` route-target import ${target}`));
    (vrf.route_targets_export || []).forEach((target) => lines.push(` route-target export ${target}`));
    lines.push("!");
  });
}

function renderPrefixLists(lines, prefixLists) {
  prefixLists.forEach((item) => {
    const prefix = parseIpv4Prefix(required(item.prefix, "prefix-list prefix"));
    let line = `ip prefix-list ${required(item.name, "prefix-list name")}`;
    if (item.sequence) line += ` seq ${Number(item.sequence)}`;
    line += ` ${item.action || "permit"} ${intToIp(prefix.network)}/${prefix.length}`;
    if (item.ge) line += ` ge ${Number(item.ge)}`;
    if (item.le) line += ` le ${Number(item.le)}`;
    lines.push(line);
  });
  if (prefixLists.length) lines.push("!");
}

function renderRouteMaps(lines, routeMaps) {
  routeMaps.forEach((item) => {
    lines.push(`route-map ${required(item.name, "route-map name")} ${item.action || "permit"} ${Number(item.sequence || 10)}`);
    if (item.match_prefix_lists?.length) lines.push(` match ip address prefix-list ${item.match_prefix_lists.join(" ")}`);
    if (item.set_local_preference) lines.push(` set local-preference ${Number(item.set_local_preference)}`);
    if (item.set_metric) lines.push(` set metric ${item.set_metric}`);
    if (item.set_as_path_prepend) lines.push(` set as-path prepend ${item.set_as_path_prepend}`);
    lines.push("!");
  });
}

function renderSpanningTree(lines, spanningTree) {
  if (!hasSpanningTreeConfig(spanningTree)) return;
  if (spanningTree.mode) lines.push(`spanning-tree mode ${spanningTree.mode}`);
  if (spanningTree.portfast_default) lines.push("spanning-tree portfast default");
  if (spanningTree.bpduguard_default) lines.push("spanning-tree portfast bpduguard default");
  (spanningTree.vlan_priorities || []).forEach((item) => {
    lines.push(`spanning-tree vlan ${(item.vlans || []).map(Number).join(",")} priority ${Number(item.priority)}`);
  });
  lines.push("!");
}

function renderDhcp(lines, dhcp) {
  if (!hasDhcpConfig(dhcp)) return;
  (dhcp.excluded_addresses || []).forEach((item) => {
    if (typeof item === "string") lines.push(`ip dhcp excluded-address ${item}`);
    else lines.push(`ip dhcp excluded-address ${item.start}${item.end ? ` ${item.end}` : ""}`);
  });
  (dhcp.pools || []).forEach((pool) => {
    const prefix = parseIpv4Prefix(required(pool.network, "dhcp pool network"));
    lines.push(`ip dhcp pool ${required(pool.name, "dhcp pool name")}`);
    lines.push(` network ${intToIp(prefix.network)} ${intToIp(prefix.mask)}`);
    if (pool.default_router) lines.push(` default-router ${pool.default_router}`);
    if (pool.dns_servers?.length) lines.push(` dns-server ${pool.dns_servers.join(" ")}`);
    if (pool.domain_name) lines.push(` domain-name ${pool.domain_name}`);
    lines.push("!");
  });
}

function renderAcls(lines, acls) {
  acls.forEach((acl) => {
    const aclType = acl.type || "extended";
    lines.push(`ip access-list ${aclType} ${required(acl.name, "acl name")}`);
    (acl.entries || []).forEach((entry) => lines.push(` ${formatAclEntry(entry, aclType)}`));
    lines.push("!");
  });
}

function renderInterface(lines, iface) {
  const mode = iface.mode || "routed";
  lines.push(`interface ${required(iface.name, "interface name")}`);
  if (iface.description) lines.push(` description ${iface.description}`);
  if (iface.vrf) lines.push(` vrf forwarding ${iface.vrf}`);

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
  renderInterfaceFeatures(lines, iface);
  if (mode !== "loopback") lines.push(iface.shutdown ? " shutdown" : " no shutdown");
  lines.push("!");
}

function renderInterfaceFeatures(lines, iface) {
  (iface.helper_addresses || []).forEach((address) => lines.push(` ip helper-address ${address}`));
  (iface.hsrp || []).forEach((group) => {
    const groupId = Number(required(group.group, "hsrp group"));
    lines.push(` standby ${groupId} ip ${required(group.virtual_ip, "hsrp virtual ip")}`);
    if (group.priority) lines.push(` standby ${groupId} priority ${Number(group.priority)}`);
    if (group.preempt) lines.push(` standby ${groupId} preempt`);
  });
  (iface.access_groups || []).forEach((item) => lines.push(` ip access-group ${item.name} ${item.direction}`));
  if (iface.nat_role) lines.push(` ip nat ${iface.nat_role}`);
  if (iface.channel_group) lines.push(` channel-group ${Number(iface.channel_group)} mode ${iface.channel_mode || "active"}`);
  if (iface.port_security) {
    lines.push(" switchport port-security");
    if (iface.port_security.maximum) lines.push(` switchport port-security maximum ${Number(iface.port_security.maximum)}`);
    if (iface.port_security.violation) lines.push(` switchport port-security violation ${iface.port_security.violation}`);
    if (iface.port_security.sticky) lines.push(" switchport port-security mac-address sticky");
  }
  if (iface.spanning_tree_bpduguard) lines.push(" spanning-tree bpduguard enable");
}

function renderNat(lines, nat) {
  if (!hasNatConfig(nat)) return;
  (nat.inside_source || []).forEach((item) => {
    let line = `ip nat inside source list ${required(item.acl, "nat acl")} interface ${required(item.interface, "nat interface")}`;
    if (item.overload !== false) line += " overload";
    lines.push(line);
  });
  if ((nat.inside_source || []).length) lines.push("!");
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
    const vrf = route.vrf ? ` vrf ${route.vrf}` : "";
    lines.push(`ip route${vrf} ${intToIp(prefix.network)} ${intToIp(prefix.mask)} ${required(route.next_hop, "static route next hop")}`);
  });

  if (routing.ospf) {
    lines.push("!");
    lines.push(`router ospf ${Number(routing.ospf.process_id || 1)}`);
    if (routing.ospf.router_id) lines.push(` router-id ${routing.ospf.router_id}`);
    (routing.ospf.networks || []).forEach((network) => {
      const prefix = parseIpv4Prefix(required(network.prefix, "ospf network prefix"));
      lines.push(` network ${intToIp(prefix.network)} ${intToIp(prefix.hostmask)} area ${network.area ?? 0}`);
    });
    renderRedistribute(lines, routing.ospf.redistribute || [], true);
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
    renderRedistribute(lines, routing.eigrp.redistribute || []);
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
      if (neighbor.next_hop_self) lines.push(` neighbor ${neighbor.address} next-hop-self`);
      if (neighbor.send_community) lines.push(` neighbor ${neighbor.address} send-community ${neighbor.send_community === true ? "both" : neighbor.send_community}`);
      if (neighbor.soft_reconfiguration) lines.push(` neighbor ${neighbor.address} soft-reconfiguration inbound`);
      if (neighbor.route_map_in) lines.push(` neighbor ${neighbor.address} route-map ${neighbor.route_map_in} in`);
      if (neighbor.route_map_out) lines.push(` neighbor ${neighbor.address} route-map ${neighbor.route_map_out} out`);
      if (neighbor.prefix_list_in) lines.push(` neighbor ${neighbor.address} prefix-list ${neighbor.prefix_list_in} in`);
      if (neighbor.prefix_list_out) lines.push(` neighbor ${neighbor.address} prefix-list ${neighbor.prefix_list_out} out`);
    });
    (routing.bgp.networks || []).forEach((network) => {
      const prefix = parseIpv4Prefix(required(network.prefix, "bgp network prefix"));
      lines.push(` network ${intToIp(prefix.network)} mask ${intToIp(prefix.mask)}`);
    });
    renderRedistribute(lines, routing.bgp.redistribute || []);
  }
  if ((routing.static || []).length || routing.ospf || routing.eigrp || routing.bgp) lines.push("!");
}

function renderRedistribute(lines, items, defaultSubnets = false) {
  items.forEach((item) => {
    let line = ` redistribute ${required(item.source, "redistribute source")}`;
    if (item.metric) line += ` metric ${item.metric}`;
    if (item.subnets ?? defaultSubnets) line += " subnets";
    if (item.route_map) line += ` route-map ${item.route_map}`;
    lines.push(line);
  });
}

function formatAclEntry(entry, aclType) {
  if (entry.remark) return `remark ${entry.remark}`;
  const sequence = entry.sequence ? `${Number(entry.sequence)} ` : "";
  const action = entry.action || "permit";
  const source = formatAclEndpoint(entry.source || "any");
  let line;
  if (aclType === "standard") {
    line = `${sequence}${action} ${source}`;
  } else {
    const protocol = entry.protocol || "ip";
    const destination = formatAclEndpoint(entry.destination || "any");
    line = `${sequence}${action} ${protocol} ${source} ${destination}`;
    if (entry.destination_port) line += ` eq ${entry.destination_port}`;
  }
  if (entry.log) line += " log";
  return line;
}

function formatAclEndpoint(value) {
  const text = String(value || "any");
  if (text === "any") return "any";
  if (text.includes("/")) {
    const prefix = parseIpv4Prefix(text);
    if (prefix.length === 32) return `host ${intToIp(prefix.network)}`;
    return `${intToIp(prefix.network)} ${intToIp(prefix.hostmask)}`;
  }
  ipToInt(text);
  return `host ${text}`;
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
    const rawLayer = String(device.device_layer || "L3").toUpperCase();
    const layer = normalizedDeviceLayer(device);
    if (!device.hostname) errors.push(`devices[${deviceIndex}].hostname 必填`);
    if (device.hostname && !HOSTNAME_PATTERN.test(device.hostname)) errors.push(`${device.hostname}: hostname 含中文或非 CLI 安全字元`);
    if (!DEVICE_LAYERS.has(rawLayer)) errors.push(`${device.hostname}: device_layer 必須是 L2 或 L3`);
    validateCliSafe(device.role, `${device.hostname}.role`, errors);
    validateCliSafe(device.platform, `${device.hostname}.platform`, errors);
    validateCliSafe(device.domain_name, `${device.hostname}.domain_name`, errors);
    if (device.hostname && hostnames.has(device.hostname)) errors.push(`hostname 重複: ${device.hostname}`);
    hostnames.add(device.hostname);

    (device.vrfs || []).forEach((vrf, index) => {
      if (!vrf.name) errors.push(`${device.hostname}.vrfs[${index}].name 必填`);
      validateCliSafe(vrf.name, `${device.hostname}.vrfs[${index}].name`, errors);
      validateCliSafe(vrf.rd, `${device.hostname}.vrfs[${index}].rd`, errors);
      (vrf.route_targets_import || []).forEach((target, targetIndex) => validateCliSafe(target, `${device.hostname}.vrfs[${index}].route_targets_import[${targetIndex}]`, errors));
      (vrf.route_targets_export || []).forEach((target, targetIndex) => validateCliSafe(target, `${device.hostname}.vrfs[${index}].route_targets_export[${targetIndex}]`, errors));
    });

    (device.prefix_lists || []).forEach((item, index) => {
      if (!item.name) errors.push(`${device.hostname}.prefix_lists[${index}].name 必填`);
      validateCliSafe(item.name, `${device.hostname}.prefix_lists[${index}].name`, errors);
      if (item.action && !ACL_ACTIONS.has(item.action)) errors.push(`${device.hostname}.prefix_lists[${index}].action 必須是 permit 或 deny`);
      validatePrefix(item.prefix, `${device.hostname}.prefix_lists[${index}].prefix`, errors);
      ["sequence", "ge", "le"].forEach((key) => {
        if (!item[key]) return;
        const value = Number(item[key]);
        if (!Number.isInteger(value) || value < 0 || (["ge", "le"].includes(key) && value > 32)) errors.push(`${device.hostname}.prefix_lists[${index}].${key} 必須是 0-32`);
      });
    });

    (device.route_maps || []).forEach((item, index) => {
      if (!item.name) errors.push(`${device.hostname}.route_maps[${index}].name 必填`);
      validateCliSafe(item.name, `${device.hostname}.route_maps[${index}].name`, errors);
      if (item.action && !ACL_ACTIONS.has(item.action)) errors.push(`${device.hostname}.route_maps[${index}].action 必須是 permit 或 deny`);
      const sequence = Number(item.sequence ?? 10);
      if (!Number.isInteger(sequence) || sequence < 0) errors.push(`${device.hostname}.route_maps[${index}].sequence 必須是 0 或正整數`);
      (item.match_prefix_lists || []).forEach((name, listIndex) => validateCliSafe(name, `${device.hostname}.route_maps[${index}].match_prefix_lists[${listIndex}]`, errors));
      if (item.set_local_preference) {
        const localPreference = Number(item.set_local_preference);
        if (!Number.isInteger(localPreference) || localPreference < 0) errors.push(`${device.hostname}.route_maps[${index}].set_local_preference 必須是 0 或正整數`);
      }
      validateCliSafe(item.set_metric, `${device.hostname}.route_maps[${index}].set_metric`, errors);
      validateCliSafe(item.set_as_path_prepend, `${device.hostname}.route_maps[${index}].set_as_path_prepend`, errors);
    });

    if (hasSpanningTreeConfig(device.spanning_tree)) {
      if (device.spanning_tree.mode && !STP_MODES.has(device.spanning_tree.mode)) errors.push(`${device.hostname}.spanning_tree.mode 必須是 pvst、rapid-pvst 或 mst`);
      (device.spanning_tree.vlan_priorities || []).forEach((item, index) => {
        (item.vlans || []).forEach((vlan, vlanIndex) => validateVlanId(vlan, `${device.hostname}.spanning_tree.vlan_priorities[${index}].vlans[${vlanIndex}]`, errors));
        const priority = Number(item.priority);
        if (!Number.isInteger(priority) || priority < 0 || priority > 61440 || priority % 4096 !== 0) {
          errors.push(`${device.hostname}.spanning_tree.vlan_priorities[${index}].priority 必須是 0-61440 且為 4096 倍數`);
        }
      });
    }

    if (layer === "L2" && hasDhcpConfig(device.dhcp)) errors.push(`${device.hostname}: L2 設備不允許 DHCP Server`);
    (device.dhcp?.excluded_addresses || []).forEach((item, index) => {
      const excluded = normalizeExcludedAddress(item);
      validateIp(excluded.start, `${device.hostname}.dhcp.excluded_addresses[${index}].start`, errors);
      if (excluded.end) validateIp(excluded.end, `${device.hostname}.dhcp.excluded_addresses[${index}].end`, errors);
    });
    (device.dhcp?.pools || []).forEach((pool, index) => {
      if (!pool.name) errors.push(`${device.hostname}.dhcp.pools[${index}].name 必填`);
      validateCliSafe(pool.name, `${device.hostname}.dhcp.pools[${index}].name`, errors);
      validatePrefix(pool.network, `${device.hostname}.dhcp.pools[${index}].network`, errors);
      if (pool.default_router) validateIp(pool.default_router, `${device.hostname}.dhcp.pools[${index}].default_router`, errors);
      (pool.dns_servers || []).forEach((server, serverIndex) => validateIp(server, `${device.hostname}.dhcp.pools[${index}].dns_servers[${serverIndex}]`, errors));
      validateCliSafe(pool.domain_name, `${device.hostname}.dhcp.pools[${index}].domain_name`, errors);
    });

    (device.acls || []).forEach((acl, aclIndex) => {
      if (!acl.name) errors.push(`${device.hostname}.acls[${aclIndex}].name 必填`);
      validateCliSafe(acl.name, `${device.hostname}.acls[${aclIndex}].name`, errors);
      const aclType = acl.type || "extended";
      if (!ACL_TYPES.has(aclType)) errors.push(`${device.hostname}.acls[${aclIndex}].type 必須是 standard 或 extended`);
      (acl.entries || []).forEach((entry, entryIndex) => {
        if (entry.remark) {
          validateCliSafe(entry.remark, `${device.hostname}.acls[${aclIndex}].entries[${entryIndex}].remark`, errors);
          return;
        }
        if (entry.action && !ACL_ACTIONS.has(entry.action)) errors.push(`${device.hostname}.acls[${aclIndex}].entries[${entryIndex}].action 必須是 permit 或 deny`);
        validateCliSafe(entry.protocol, `${device.hostname}.acls[${aclIndex}].entries[${entryIndex}].protocol`, errors);
        validateAclEndpoint(entry.source || "any", `${device.hostname}.acls[${aclIndex}].entries[${entryIndex}].source`, errors);
        if (aclType === "extended") validateAclEndpoint(entry.destination || "any", `${device.hostname}.acls[${aclIndex}].entries[${entryIndex}].destination`, errors);
        validateCliSafe(entry.destination_port, `${device.hostname}.acls[${aclIndex}].entries[${entryIndex}].destination_port`, errors);
      });
    });

    if (layer === "L2" && hasNatConfig(device.nat)) errors.push(`${device.hostname}: L2 設備不允許 NAT`);
    (device.nat?.inside_source || []).forEach((item, index) => {
      if (!item.acl) errors.push(`${device.hostname}.nat.inside_source[${index}].acl 必填`);
      validateCliSafe(item.acl, `${device.hostname}.nat.inside_source[${index}].acl`, errors);
      if (!item.interface) errors.push(`${device.hostname}.nat.inside_source[${index}].interface 必填`);
      else if (!INTERFACE_NAME_PATTERN.test(item.interface)) errors.push(`${device.hostname}.nat.inside_source[${index}].interface 含非 CLI 安全字元`);
    });

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
      if (iface.vrf) {
        validateCliSafe(iface.vrf, `${device.hostname}.${iface.name}.vrf`, errors);
        if (!["routed", "svi", "loopback"].includes(iface.mode)) errors.push(`${device.hostname}.${iface.name}: VRF 只允許 L3 介面模式`);
      }
      if (iface.address) validatePrefix(iface.address, `${device.hostname}.${iface.name}.address`, errors);
      if (layer === "L2" && iface.nat_role) errors.push(`${device.hostname}.${iface.name}: L2 設備不允許 NAT role`);
      if (iface.nat_role && !NAT_ROLES.has(iface.nat_role)) errors.push(`${device.hostname}.${iface.name}.nat_role 必須是 inside 或 outside`);
      (iface.helper_addresses || []).forEach((address, helperIndex) => {
        validateIp(address, `${device.hostname}.${iface.name}.helper_addresses[${helperIndex}]`, errors);
      });
      (iface.hsrp || []).forEach((group, groupIndex) => {
        const groupId = Number(group.group);
        if (!Number.isInteger(groupId) || groupId < 0 || groupId > 255) errors.push(`${device.hostname}.${iface.name}.hsrp[${groupIndex}].group 必須是 0-255`);
        validateIp(group.virtual_ip, `${device.hostname}.${iface.name}.hsrp[${groupIndex}].virtual_ip`, errors);
        if (group.priority) {
          const priority = Number(group.priority);
          if (!Number.isInteger(priority) || priority < 1 || priority > 255) errors.push(`${device.hostname}.${iface.name}.hsrp[${groupIndex}].priority 必須是 1-255`);
        }
      });
      (iface.access_groups || []).forEach((item, groupIndex) => {
        if (!item.name) errors.push(`${device.hostname}.${iface.name}.access_groups[${groupIndex}].name 必填`);
        validateCliSafe(item.name, `${device.hostname}.${iface.name}.access_groups[${groupIndex}].name`, errors);
        if (!["in", "out"].includes(item.direction)) errors.push(`${device.hostname}.${iface.name}.access_groups[${groupIndex}].direction 必須是 in 或 out`);
      });
      if (iface.channel_group) {
        const channelGroup = Number(iface.channel_group);
        if (!Number.isInteger(channelGroup) || channelGroup < 1) errors.push(`${device.hostname}.${iface.name}.channel_group 必須大於 0`);
      }
      if (iface.channel_mode && !CHANNEL_MODES.has(iface.channel_mode)) errors.push(`${device.hostname}.${iface.name}.channel_mode 不支援`);
      if (iface.access_vlan) validateVlanId(iface.access_vlan, `${device.hostname}.${iface.name}.access_vlan`, errors);
      if (iface.voice_vlan) validateVlanId(iface.voice_vlan, `${device.hostname}.${iface.name}.voice_vlan`, errors);
      if (iface.native_vlan) validateVlanId(iface.native_vlan, `${device.hostname}.${iface.name}.native_vlan`, errors);
      (iface.allowed_vlans || []).forEach((vlan, vlanIndex) => validateVlanId(vlan, `${device.hostname}.${iface.name}.allowed_vlans[${vlanIndex}]`, errors));
      if (iface.port_security) {
        if (iface.port_security.maximum) {
          const maximum = Number(iface.port_security.maximum);
          if (!Number.isInteger(maximum) || maximum < 1) errors.push(`${device.hostname}.${iface.name}.port_security.maximum 必須大於 0`);
        }
        if (iface.port_security.violation && !PORT_SECURITY_VIOLATIONS.has(iface.port_security.violation)) errors.push(`${device.hostname}.${iface.name}.port_security.violation 不支援`);
      }
      if (iface.mode === "access" && !iface.access_vlan) errors.push(`${device.hostname}.${iface.name}.access_vlan 必填`);
    });

    (device.routing?.static || []).forEach((route, routeIndex) => {
      const prefix = parsePrefixForValidation(route.destination, `${device.hostname}.routing.static[${routeIndex}].destination`, errors);
      if (layer === "L2" && prefix && prefix.length !== 0) errors.push(`${device.hostname}: L2 設備只允許 0.0.0.0/0 作為管理閘道`);
      validateIp(route.next_hop, `${device.hostname}.routing.static[${routeIndex}].next_hop`, errors);
      validateCliSafe(route.vrf, `${device.hostname}.routing.static[${routeIndex}].vrf`, errors);
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
    validateRedistribute(device.routing?.ospf?.redistribute || [], `${device.hostname}.routing.ospf.redistribute`, errors);

    if (device.routing?.eigrp) {
      validateAsn(device.routing.eigrp.asn, `${device.hostname}.routing.eigrp.asn`, errors);
      if (device.routing.eigrp.router_id) validateIp(device.routing.eigrp.router_id, `${device.hostname}.routing.eigrp.router_id`, errors);
      (device.routing.eigrp.networks || []).forEach((network, networkIndex) => {
        validatePrefix(network.prefix, `${device.hostname}.routing.eigrp.networks[${networkIndex}].prefix`, errors);
      });
      (device.routing.eigrp.passive_interfaces || []).forEach((name, index) => {
        if (!INTERFACE_NAME_PATTERN.test(name)) errors.push(`${device.hostname}.routing.eigrp.passive_interfaces[${index}] 含非 CLI 安全字元`);
      });
      validateRedistribute(device.routing.eigrp.redistribute || [], `${device.hostname}.routing.eigrp.redistribute`, errors);
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
        ["route_map_in", "route_map_out", "prefix_list_in", "prefix_list_out"].forEach((key) => {
          validateCliSafe(neighbor[key], `${device.hostname}.routing.bgp.neighbors[${neighborIndex}].${key}`, errors);
        });
        if (neighbor.send_community && neighbor.send_community !== true && !["standard", "extended", "both"].includes(neighbor.send_community)) {
          errors.push(`${device.hostname}.routing.bgp.neighbors[${neighborIndex}].send_community 必須是 standard、extended 或 both`);
        }
      });
      (device.routing.bgp.networks || []).forEach((network, networkIndex) => {
        validatePrefix(network.prefix, `${device.hostname}.routing.bgp.networks[${networkIndex}].prefix`, errors);
      });
      validateRedistribute(device.routing.bgp.redistribute || [], `${device.hostname}.routing.bgp.redistribute`, errors);
    }

    validateReferences(device, deviceIndex, errors);
  });
  return errors;
}

function validateReferences(device, deviceIndex, errors) {
  const vrfNames = namedSet(device.vrfs);
  const prefixListNames = namedSet(device.prefix_lists);
  const routeMapNames = namedSet(device.route_maps);
  const aclNames = namedSet(device.acls);
  const interfaceNames = namedSet(device.interfaces);

  const requireDefined = (value, knownValues, label, type) => {
    if (value && !knownValues.has(String(value))) errors.push(`${label} 參照不存在的 ${type}: ${value}`);
  };

  (device.route_maps || []).forEach((routeMap, routeMapIndex) => {
    (routeMap.match_prefix_lists || []).forEach((name, listIndex) => {
      requireDefined(name, prefixListNames, `${device.hostname}.route_maps[${routeMapIndex}].match_prefix_lists[${listIndex}]`, "prefix-list");
    });
  });

  (device.interfaces || []).forEach((iface, ifaceIndex) => {
    requireDefined(iface.vrf, vrfNames, `${device.hostname}.interfaces[${ifaceIndex}].vrf`, "VRF");
    (iface.access_groups || []).forEach((item, aclIndex) => {
      requireDefined(item.name, aclNames, `${device.hostname}.interfaces[${ifaceIndex}].access_groups[${aclIndex}].name`, "ACL");
    });
  });

  (device.routing?.static || []).forEach((route, routeIndex) => {
    requireDefined(route.vrf, vrfNames, `${device.hostname}.routing.static[${routeIndex}].vrf`, "VRF");
  });

  (device.routing?.eigrp?.passive_interfaces || []).forEach((name, index) => {
    requireDefined(name, interfaceNames, `${device.hostname}.routing.eigrp.passive_interfaces[${index}]`, "interface");
  });

  (device.routing?.bgp?.neighbors || []).forEach((neighbor, neighborIndex) => {
    requireDefined(neighbor.update_source, interfaceNames, `${device.hostname}.routing.bgp.neighbors[${neighborIndex}].update_source`, "interface");
    requireDefined(neighbor.route_map_in, routeMapNames, `${device.hostname}.routing.bgp.neighbors[${neighborIndex}].route_map_in`, "route-map");
    requireDefined(neighbor.route_map_out, routeMapNames, `${device.hostname}.routing.bgp.neighbors[${neighborIndex}].route_map_out`, "route-map");
    requireDefined(neighbor.prefix_list_in, prefixListNames, `${device.hostname}.routing.bgp.neighbors[${neighborIndex}].prefix_list_in`, "prefix-list");
    requireDefined(neighbor.prefix_list_out, prefixListNames, `${device.hostname}.routing.bgp.neighbors[${neighborIndex}].prefix_list_out`, "prefix-list");
  });

  ["ospf", "eigrp", "bgp"].forEach((protocol) => {
    (device.routing?.[protocol]?.redistribute || []).forEach((item, index) => {
      requireDefined(item.route_map, routeMapNames, `${device.hostname}.routing.${protocol}.redistribute[${index}].route_map`, "route-map");
    });
  });

  (device.nat?.inside_source || []).forEach((item, index) => {
    requireDefined(item.acl, aclNames, `${device.hostname}.nat.inside_source[${index}].acl`, "ACL");
    requireDefined(item.interface, interfaceNames, `${device.hostname}.nat.inside_source[${index}].interface`, "interface");
  });
}

function namedSet(items) {
  return new Set((items || []).map((item) => item.name).filter(Boolean).map(String));
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

function validateAclEndpoint(value, label, errors) {
  const text = String(value || "any");
  if (text === "any") return;
  try {
    if (text.includes("/")) parseIpv4Prefix(text);
    else ipToInt(text);
  } catch {
    errors.push(`${label} 必須是 any、IPv4 位址或 IPv4 prefix`);
  }
}

function validateVlanId(value, label, errors) {
  const vlanId = Number(value);
  if (!Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094) errors.push(`${label} 必須是 1-4094`);
}

function validateRedistribute(items, label, errors) {
  items.forEach((item, index) => {
    if (!item.source) errors.push(`${label}[${index}].source 必填`);
    validateCliSafe(item.source, `${label}[${index}].source`, errors);
    validateCliSafe(item.metric, `${label}[${index}].metric`, errors);
    validateCliSafe(item.route_map, `${label}[${index}].route_map`, errors);
  });
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

function hasSpanningTreeConfig(spanningTree) {
  return !!(
    spanningTree &&
    (
      spanningTree.mode ||
      spanningTree.portfast_default ||
      spanningTree.bpduguard_default ||
      (spanningTree.vlan_priorities || []).length
    )
  );
}

function hasDhcpConfig(dhcp) {
  return !!(dhcp && ((dhcp.excluded_addresses || []).length || (dhcp.pools || []).length));
}

function hasNatConfig(nat) {
  return !!(nat && (nat.inside_source || []).length);
}

function cleanForExport(value) {
  if (Array.isArray(value)) {
    const items = value.map(cleanForExport).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (value && typeof value === "object") {
    const result = {};
    Object.entries(value).forEach(([key, item]) => {
      const cleaned = cleanForExport(item);
      if (cleaned !== undefined) result[key] = cleaned;
    });
    return Object.keys(result).length ? result : undefined;
  }
  if (value === "") return undefined;
  return value;
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function redistributeSources(items) {
  return (items || []).map((item) => item.source).filter(Boolean).join(",");
}

function setRedistribute(protocol, sourcesValue, routeMapValue = "", metricValue = "", subnets = false) {
  const sources = splitList(sourcesValue);
  if (!sources.length) {
    delete protocol.redistribute;
    return;
  }
  protocol.redistribute = sources.map((source) => {
    const item = { source };
    if (routeMapValue) item.route_map = routeMapValue.trim();
    if (metricValue) item.metric = metricValue.trim();
    if (subnets) item.subnets = true;
    return item;
  });
}

function normalizeExcludedAddress(value) {
  if (typeof value === "string") return { start: value, end: "" };
  return value || { start: "", end: "" };
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

function safeUploadFilename(value) {
  const filename = String(value || "uploaded.cfg").split(/[/\\]/).pop() || "uploaded.cfg";
  const cleaned = filename.replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^[._]+|[._]+$/g, "");
  return cleaned || "uploaded.cfg";
}

function uniqueFilename(filename, existingNames) {
  if (!existingNames.has(filename)) return filename;
  const dotIndex = filename.lastIndexOf(".");
  const base = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  const extension = dotIndex > 0 ? filename.slice(dotIndex) : "";
  let index = 2;
  let candidate = `${base}-${index}${extension}`;
  while (existingNames.has(candidate)) {
    index += 1;
    candidate = `${base}-${index}${extension}`;
  }
  return candidate;
}

function hasSupportedConfigExtension(filename) {
  return /\.(cfg|txt)$/i.test(filename);
}

function normalizeConfigText(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

async function handleConfigFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) {
    elements.statusText.textContent = "沒有選到 CFG/TXT 檔案";
    return;
  }

  const generatedConfigs = renderInventory(state).configs;
  const existingNames = new Set([...Object.keys(generatedConfigs), ...Object.keys(uploadedConfigs)]);
  const accepted = [];
  const skipped = [];

  for (const file of files) {
    const filename = safeUploadFilename(file.name);
    if (!hasSupportedConfigExtension(filename)) {
      skipped.push(`${filename}: 只支援 .cfg 或 .txt`);
      continue;
    }

    try {
      const content = normalizeConfigText(await file.text());
      if (!content.trim()) {
        skipped.push(`${filename}: 檔案是空的`);
        continue;
      }

      const uniqueName = uniqueFilename(filename, existingNames);
      existingNames.add(uniqueName);
      uploadedConfigs[uniqueName] = content.endsWith("\n") ? content : `${content}\n`;
      accepted.push(uniqueName);
    } catch (error) {
      skipped.push(`${filename}: 讀取失敗 ${error.message}`);
    }
  }

  uploadWarnings = [
    ...accepted.map((filename) => `${filename}: 已上傳到輸出區`),
    ...skipped,
  ];
  if (accepted.length) selectedOutputFile = accepted[accepted.length - 1];
  renderOutput();
  if (accepted.length) {
    focusOutputPanel();
    elements.statusText.textContent = `已上傳 ${accepted.length} 份 CFG/TXT`;
  } else {
    elements.statusText.textContent = "沒有可上傳的 CFG/TXT 檔案";
  }
  flashElement(elements.outputPanel);
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
  elements.configOutput.focus();
  elements.configOutput.select();

  try {
    if (document.execCommand("copy")) return true;
  } catch {
    // Fall through to the async clipboard API when execCommand is unavailable.
  }

  if (!navigator.clipboard?.writeText) return false;
  await Promise.race([
    navigator.clipboard.writeText(text),
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error("clipboard timeout")), 800);
    }),
  ]);
  return true;
}

function flashElement(element) {
  if (!element) return;
  element.classList.remove("attention-flash");
  void element.offsetWidth;
  element.classList.add("attention-flash");
  window.setTimeout(() => element.classList.remove("attention-flash"), 900);
}

function focusDeviceEditor() {
  activeTab = "device";
  renderForms();
  elements.editorPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  elements.deviceForm.elements.hostname?.focus();
  elements.statusText.textContent = "已切到設備編輯";
  flashElement(elements.editorPanel);
}

function focusOutputPanel() {
  renderOutput();
  elements.outputPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  elements.configOutput.focus();
  elements.statusText.textContent = "請確認右側輸出，可直接複製貼上";
  flashElement(elements.outputPanel);
}

async function copyCurrentConfig() {
  if (!elements.configOutput.value) {
    elements.statusText.textContent = "目前沒有可複製的設定檔";
    return;
  }
  try {
    const copied = await copyText(elements.configOutput.value);
    elements.statusText.textContent = copied ? "已複製設定檔，可貼到 Console / SSH" : "已選取設定檔，請按 Ctrl/Cmd+C 複製";
  } catch {
    elements.configOutput.focus();
    elements.configOutput.select();
    elements.statusText.textContent = "已選取設定檔，請按 Ctrl/Cmd+C 複製";
  }
  flashElement(elements.outputPanel);
}

elements.introEditBtn.addEventListener("click", focusDeviceEditor);
elements.introOutputBtn.addEventListener("click", focusOutputPanel);
elements.introCopyBtn.addEventListener("click", copyCurrentConfig);

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

elements.uploadConfigBtn.addEventListener("click", () => {
  elements.statusText.textContent = "請選擇 .cfg 或 .txt 檔案";
});
elements.uploadConfigBtn.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  elements.configFileInput.click();
});
elements.configFileInput.addEventListener("change", async () => {
  await handleConfigFiles(elements.configFileInput.files);
  elements.configFileInput.value = "";
});

elements.configDropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  elements.configDropZone.classList.add("drag-active");
  elements.statusText.textContent = "放開即可上傳 CFG/TXT";
});

elements.configDropZone.addEventListener("dragleave", () => {
  elements.configDropZone.classList.remove("drag-active");
});

elements.configDropZone.addEventListener("drop", async (event) => {
  event.preventDefault();
  elements.configDropZone.classList.remove("drag-active");
  await handleConfigFiles(event.dataTransfer?.files);
});

elements.exportBtn.addEventListener("click", () => {
  const exported = cleanForExport(state) || { devices: [] };
  download("devices.json", `${JSON.stringify(exported, null, 2)}\n`, "application/json");
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

elements.advancedTab.addEventListener("click", () => {
  activeTab = "advanced";
  renderForms();
});

elements.deviceForm.addEventListener("input", updateDeviceFromForm);
elements.deviceForm.addEventListener("change", (event) => {
  updateDeviceFromForm(event);
  updateRowFromEvent(event);
});
elements.deviceForm.addEventListener("input", updateRowFromEvent);
elements.advancedForm.addEventListener("input", updateAdvancedFromEvent);
elements.advancedForm.addEventListener("change", updateAdvancedFromEvent);
elements.advancedForm.addEventListener("input", updateRowFromEvent);
elements.advancedForm.addEventListener("change", updateRowFromEvent);
elements.defaultsForm.addEventListener("input", updateDefaultsFromForm);
elements.defaultsForm.addEventListener("change", updateDefaultsFromForm);

elements.deviceForm.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  if (target.dataset.action === "remove") removeRow(target.dataset.kind, Number(target.dataset.index), target.dataset);
});

elements.advancedForm.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  if (target.dataset.action === "remove") removeRow(target.dataset.kind, Number(target.dataset.index), target.dataset);
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

elements.ospfRedistributeSources.addEventListener("input", () => {
  sanitizeTargetInput(elements.ospfRedistributeSources);
  setRedistribute(currentDevice().routing.ospf, elements.ospfRedistributeSources.value, elements.ospfRedistributeRouteMap.value, "", true);
  renderOutput();
});

elements.ospfRedistributeRouteMap.addEventListener("input", () => {
  sanitizeTargetInput(elements.ospfRedistributeRouteMap);
  setRedistribute(currentDevice().routing.ospf, elements.ospfRedistributeSources.value, elements.ospfRedistributeRouteMap.value, "", true);
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

elements.eigrpRedistributeSources.addEventListener("input", () => {
  sanitizeTargetInput(elements.eigrpRedistributeSources);
  setRedistribute(currentDevice().routing.eigrp, elements.eigrpRedistributeSources.value, elements.eigrpRedistributeRouteMap.value, elements.eigrpRedistributeMetric.value);
  renderOutput();
});

elements.eigrpRedistributeMetric.addEventListener("input", () => {
  sanitizeTargetInput(elements.eigrpRedistributeMetric);
  setRedistribute(currentDevice().routing.eigrp, elements.eigrpRedistributeSources.value, elements.eigrpRedistributeRouteMap.value, elements.eigrpRedistributeMetric.value);
  renderOutput();
});

elements.eigrpRedistributeRouteMap.addEventListener("input", () => {
  sanitizeTargetInput(elements.eigrpRedistributeRouteMap);
  setRedistribute(currentDevice().routing.eigrp, elements.eigrpRedistributeSources.value, elements.eigrpRedistributeRouteMap.value, elements.eigrpRedistributeMetric.value);
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

elements.bgpRedistributeSources.addEventListener("input", () => {
  sanitizeTargetInput(elements.bgpRedistributeSources);
  setRedistribute(currentDevice().routing.bgp, elements.bgpRedistributeSources.value, elements.bgpRedistributeRouteMap.value);
  renderOutput();
});

elements.bgpRedistributeRouteMap.addEventListener("input", () => {
  sanitizeTargetInput(elements.bgpRedistributeRouteMap);
  setRedistribute(currentDevice().routing.bgp, elements.bgpRedistributeSources.value, elements.bgpRedistributeRouteMap.value);
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

elements.addVrfBtn.addEventListener("click", () => {
  const device = currentDevice();
  device.vrfs ||= [];
  device.vrfs.push({ name: `VRF-${device.vrfs.length + 1}`, rd: "65001:1", route_targets_import: ["65001:1"], route_targets_export: ["65001:1"] });
  render();
});

elements.addPrefixListBtn.addEventListener("click", () => {
  const device = currentDevice();
  device.prefix_lists ||= [];
  device.prefix_lists.push({ name: `PL-${device.prefix_lists.length + 1}`, sequence: 10, action: "permit", prefix: "10.0.0.0/8" });
  render();
});

elements.addRouteMapBtn.addEventListener("click", () => {
  const device = currentDevice();
  device.route_maps ||= [];
  device.route_maps.push({ name: `RM-${device.route_maps.length + 1}`, sequence: 10, action: "permit", match_prefix_lists: [] });
  render();
});

elements.addStpPriorityBtn.addEventListener("click", () => {
  const device = currentDevice();
  device.spanning_tree ||= { mode: "rapid-pvst", vlan_priorities: [] };
  device.spanning_tree.vlan_priorities ||= [];
  device.spanning_tree.vlan_priorities.push({ vlans: [10], priority: 4096 });
  render();
});

elements.addDhcpExcludedBtn.addEventListener("click", () => {
  const device = currentDevice();
  device.dhcp ||= {};
  device.dhcp.excluded_addresses ||= [];
  device.dhcp.excluded_addresses.push({ start: "10.0.0.1", end: "10.0.0.20" });
  render();
});

elements.addDhcpPoolBtn.addEventListener("click", () => {
  const device = currentDevice();
  device.dhcp ||= {};
  device.dhcp.pools ||= [];
  device.dhcp.pools.push({ name: "USERS", network: "10.0.0.0/24", default_router: "10.0.0.1", dns_servers: ["1.1.1.1"] });
  render();
});

elements.addAclBtn.addEventListener("click", () => {
  const device = currentDevice();
  device.acls ||= [];
  device.acls.push({ name: `ACL-${device.acls.length + 1}`, type: "extended", entries: [] });
  render();
});

elements.addAclEntryBtn.addEventListener("click", () => {
  const device = currentDevice();
  device.acls ||= [];
  if (!device.acls.length) device.acls.push({ name: "ACL-1", type: "extended", entries: [] });
  device.acls[0].entries ||= [];
  device.acls[0].entries.push({ action: "permit", protocol: "ip", source: "any", destination: "any" });
  render();
});

elements.addNatRuleBtn.addEventListener("click", () => {
  const device = currentDevice();
  device.nat ||= {};
  device.nat.inside_source ||= [];
  device.nat.inside_source.push({ acl: "INSIDE-NAT", interface: "GigabitEthernet0/0", overload: true });
  render();
});

elements.outputSelect.addEventListener("change", () => {
  selectedOutputFile = elements.outputSelect.value;
  renderOutput();
});

elements.copyConfigBtn.addEventListener("click", async () => {
  await copyCurrentConfig();
});

elements.downloadConfigBtn.addEventListener("click", () => {
  if (!selectedOutputFile) return;
  download(selectedOutputFile, elements.configOutput.value);
});

elements.clearUploadedBtn.addEventListener("click", () => {
  const count = Object.keys(uploadedConfigs).length;
  if (!count) {
    elements.statusText.textContent = "目前沒有上傳檔案";
    return;
  }
  uploadedConfigs = {};
  uploadWarnings = [];
  selectedOutputFile = "";
  renderOutput();
  elements.statusText.textContent = `已清除 ${count} 份上傳檔案`;
});

render();
