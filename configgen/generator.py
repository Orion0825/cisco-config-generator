from __future__ import annotations

import ipaddress
import json
import os
import re
from pathlib import Path
from typing import Any


class InventoryError(ValueError):
    """Raised when inventory data is invalid."""


ENV_PATTERN = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")
SAFE_FILENAME_PATTERN = re.compile(r"[^A-Za-z0-9_.-]+")
HOSTNAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$")
CLI_SAFE_PATTERN = re.compile(r"^[A-Za-z0-9 _./:,@#()+=$*{}-]*$")
INTERFACE_NAME_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9/_.:-]*$")
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+$")
INTERFACE_MODES = {"routed", "access", "trunk", "svi", "loopback"}
DEVICE_LAYERS = {"L2", "L3"}
ACL_TYPES = {"standard", "extended"}
ACL_ACTIONS = {"permit", "deny"}
CHANNEL_MODES = {"active", "passive", "on", "auto", "desirable"}
NAT_ROLES = {"inside", "outside"}
STP_MODES = {"pvst", "rapid-pvst", "mst"}
PORT_SECURITY_VIOLATIONS = {"protect", "restrict", "shutdown"}


def has_spanning_tree_config(spanning_tree: dict[str, Any]) -> bool:
    return bool(
        spanning_tree
        and (
            spanning_tree.get("mode")
            or spanning_tree.get("portfast_default")
            or spanning_tree.get("bpduguard_default")
            or spanning_tree.get("vlan_priorities")
        )
    )


def has_dhcp_config(dhcp: dict[str, Any]) -> bool:
    return bool(dhcp and (dhcp.get("excluded_addresses") or dhcp.get("pools")))


def has_nat_config(nat: dict[str, Any]) -> bool:
    return bool(nat and nat.get("inside_source"))


def load_inventory(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except json.JSONDecodeError as exc:
        raise InventoryError(f"{path}: invalid JSON at line {exc.lineno}: {exc.msg}") from exc
    except OSError as exc:
        raise InventoryError(f"{path}: unable to read inventory: {exc}") from exc

    if not isinstance(data, dict):
        raise InventoryError("inventory root must be a JSON object")
    validate_inventory(data)
    return data


def render_inventory(inventory: dict[str, Any]) -> dict[str, str]:
    validate_inventory(inventory)
    defaults = inventory.get("defaults", {})
    rendered = {}

    for device in inventory["devices"]:
        hostname = require_string(device, "hostname", "device")
        rendered[f"{safe_filename(hostname)}.cfg"] = render_device(defaults, device)

    return rendered


def render_device(defaults: dict[str, Any], device: dict[str, Any]) -> str:
    hostname = require_string(device, "hostname", "device")
    device_layer = normalized_device_layer(device)
    lines: list[str] = []

    def add(value: str = "") -> None:
        lines.append(value)

    add("!")
    add("! cisco編輯器byOrion")
    add(f"! Device layer: {device_layer}")
    add("!")
    add(f"hostname {hostname}")
    add("no ip domain-lookup")
    add("service timestamps debug datetime msec")
    add("service timestamps log datetime msec")
    add("service password-encryption")

    domain_name = device.get("domain_name", defaults.get("domain_name"))
    if domain_name:
        add(f"ip domain-name {domain_name}")

    for server in merge_lists(defaults, device, "name_servers"):
        add(f"ip name-server {server}")

    for server in merge_lists(defaults, device, "ntp_servers"):
        add(f"ntp server {server}")

    local_users = merge_lists(defaults, device, "local_users")
    for user in local_users:
        name = require_string(user, "name", "local_users")
        privilege = int(user.get("privilege", 15))
        secret_type = str(user.get("secret_type", "0"))
        secret = resolve_env(str(user.get("secret", "CHANGE_ME")))
        add(f"username {name} privilege {privilege} secret {secret_type} {secret}")

    if defaults.get("ssh", {}).get("enabled", True) or device.get("ssh", {}).get("enabled", False):
        ssh = {**defaults.get("ssh", {}), **device.get("ssh", {})}
        add("ip ssh version 2")
        add(f"crypto key generate rsa modulus {int(ssh.get('modulus', 2048))}")

    add("!")
    render_spanning_tree(lines, device.get("spanning_tree", {}))
    render_dhcp(lines, device.get("dhcp", {}))
    render_acls(lines, device.get("acls", []))
    render_vlans(lines, device.get("vlans", []))
    render_interfaces(lines, device.get("interfaces", []))
    render_nat(lines, device.get("nat", {}))
    render_routing(lines, device.get("routing", {}), device_layer)
    render_vty(lines, defaults, device, bool(local_users))
    add("end")

    return "\n".join(lines).rstrip() + "\n"


def render_vlans(lines: list[str], vlans: list[dict[str, Any]]) -> None:
    for vlan in sorted(vlans, key=lambda item: int(item["id"])):
        lines.append(f"vlan {int(vlan['id'])}")
        if vlan.get("name"):
            lines.append(f" name {vlan['name']}")
        lines.append("!")


def render_spanning_tree(lines: list[str], spanning_tree: dict[str, Any]) -> None:
    if not has_spanning_tree_config(spanning_tree):
        return
    if spanning_tree.get("mode"):
        lines.append(f"spanning-tree mode {spanning_tree['mode']}")
    if spanning_tree.get("portfast_default"):
        lines.append("spanning-tree portfast default")
    if spanning_tree.get("bpduguard_default"):
        lines.append("spanning-tree portfast bpduguard default")
    for item in spanning_tree.get("vlan_priorities", []):
        lines.append(f"spanning-tree vlan {format_vlan_list(item['vlans'])} priority {int(item['priority'])}")
    lines.append("!")


def render_dhcp(lines: list[str], dhcp: dict[str, Any]) -> None:
    if not has_dhcp_config(dhcp):
        return
    for item in dhcp.get("excluded_addresses", []):
        if isinstance(item, str):
            lines.append(f"ip dhcp excluded-address {item}")
        else:
            end = f" {item['end']}" if item.get("end") else ""
            lines.append(f"ip dhcp excluded-address {item['start']}{end}")
    for pool in dhcp.get("pools", []):
        network = ipaddress.ip_network(pool["network"], strict=False)
        lines.append(f"ip dhcp pool {pool['name']}")
        lines.append(f" network {network.network_address} {network.netmask}")
        if pool.get("default_router"):
            lines.append(f" default-router {pool['default_router']}")
        if pool.get("dns_servers"):
            lines.append(f" dns-server {' '.join(pool['dns_servers'])}")
        if pool.get("domain_name"):
            lines.append(f" domain-name {pool['domain_name']}")
        lines.append("!")


def render_acls(lines: list[str], acls: list[dict[str, Any]]) -> None:
    for acl in acls:
        acl_type = acl.get("type", "extended")
        lines.append(f"ip access-list {acl_type} {acl['name']}")
        for entry in acl.get("entries", []):
            lines.append(f" {format_acl_entry(entry, acl_type)}")
        lines.append("!")


def render_interfaces(lines: list[str], interfaces: list[dict[str, Any]]) -> None:
    for interface in interfaces:
        mode = interface.get("mode", "routed")
        lines.append(f"interface {require_string(interface, 'name', 'interfaces')}")
        if interface.get("description"):
            lines.append(f" description {interface['description']}")

        if mode == "routed":
            render_layer3_address(lines, interface)
        elif mode == "loopback":
            render_layer3_address(lines, interface)
        elif mode == "svi":
            render_layer3_address(lines, interface)
        elif mode == "access":
            lines.append(" switchport")
            lines.append(" switchport mode access")
            lines.append(f" switchport access vlan {int(interface['access_vlan'])}")
            if interface.get("voice_vlan"):
                lines.append(f" switchport voice vlan {int(interface['voice_vlan'])}")
            if interface.get("spanning_tree_portfast", False):
                lines.append(" spanning-tree portfast")
        elif mode == "trunk":
            lines.append(" switchport")
            lines.append(" switchport mode trunk")
            if interface.get("native_vlan"):
                lines.append(f" switchport trunk native vlan {int(interface['native_vlan'])}")
            if interface.get("allowed_vlans"):
                lines.append(f" switchport trunk allowed vlan {format_vlan_list(interface['allowed_vlans'])}")

        render_interface_features(lines, interface)
        if mode != "loopback":
            lines.append(" shutdown" if interface.get("shutdown", False) else " no shutdown")
        lines.append("!")


def render_interface_features(lines: list[str], interface: dict[str, Any]) -> None:
    for helper in interface.get("helper_addresses", []):
        lines.append(f" ip helper-address {helper}")
    for group in interface.get("hsrp", []):
        group_id = int(group["group"])
        lines.append(f" standby {group_id} ip {group['virtual_ip']}")
        if group.get("priority"):
            lines.append(f" standby {group_id} priority {int(group['priority'])}")
        if group.get("preempt"):
            lines.append(f" standby {group_id} preempt")
    for item in interface.get("access_groups", []):
        lines.append(f" ip access-group {item['name']} {item['direction']}")
    if interface.get("nat_role"):
        lines.append(f" ip nat {interface['nat_role']}")
    if interface.get("channel_group"):
        lines.append(f" channel-group {int(interface['channel_group'])} mode {interface.get('channel_mode', 'active')}")
    port_security = interface.get("port_security")
    if port_security:
        lines.append(" switchport port-security")
        if port_security.get("maximum"):
            lines.append(f" switchport port-security maximum {int(port_security['maximum'])}")
        if port_security.get("violation"):
            lines.append(f" switchport port-security violation {port_security['violation']}")
        if port_security.get("sticky"):
            lines.append(" switchport port-security mac-address sticky")
    if interface.get("spanning_tree_bpduguard"):
        lines.append(" spanning-tree bpduguard enable")


def render_layer3_address(lines: list[str], interface: dict[str, Any]) -> None:
    if interface.get("address"):
        address, netmask = ios_address(interface["address"])
        lines.append(f" ip address {address} {netmask}")
    else:
        lines.append(" no ip address")


def render_nat(lines: list[str], nat: dict[str, Any]) -> None:
    if not has_nat_config(nat):
        return
    for item in nat.get("inside_source", []):
        line = f"ip nat inside source list {item['acl']} interface {item['interface']}"
        if item.get("overload", True):
            line += " overload"
        lines.append(line)
    if nat.get("inside_source"):
        lines.append("!")


def render_routing(lines: list[str], routing: dict[str, Any], device_layer: str = "L3") -> None:
    if device_layer == "L2":
        for route in routing.get("static", []):
            destination = ipaddress.ip_network(route["destination"], strict=False)
            if destination.prefixlen == 0:
                lines.append(f"ip default-gateway {route['next_hop']}")
        if routing.get("static"):
            lines.append("!")
        return

    for route in routing.get("static", []):
        destination = ipaddress.ip_network(route["destination"], strict=False)
        if destination.version != 4:
            raise InventoryError("only IPv4 static routes are supported right now")
        lines.append(f"ip route {destination.network_address} {destination.netmask} {route['next_hop']}")

    ospf = routing.get("ospf")
    if ospf:
        lines.append("!")
        lines.append(f"router ospf {int(ospf.get('process_id', 1))}")
        if ospf.get("router_id"):
            lines.append(f" router-id {ospf['router_id']}")
        for network in ospf.get("networks", []):
            prefix = ipaddress.ip_network(network["prefix"], strict=False)
            if prefix.version != 4:
                raise InventoryError("only IPv4 OSPF networks are supported right now")
            lines.append(f" network {prefix.network_address} {wildcard_mask(prefix)} area {network.get('area', 0)}")

    eigrp = routing.get("eigrp")
    if eigrp:
        lines.append("!")
        lines.append(f"router eigrp {int(eigrp['asn'])}")
        if eigrp.get("router_id"):
            lines.append(f" eigrp router-id {eigrp['router_id']}")
        for network in eigrp.get("networks", []):
            prefix = ipaddress.ip_network(network["prefix"], strict=False)
            if prefix.version != 4:
                raise InventoryError("only IPv4 EIGRP networks are supported right now")
            lines.append(f" network {prefix.network_address} {wildcard_mask(prefix)}")
        for interface in eigrp.get("passive_interfaces", []):
            lines.append(f" passive-interface {interface}")
        if eigrp.get("no_auto_summary", True):
            lines.append(" no auto-summary")

    bgp = routing.get("bgp")
    if bgp:
        lines.append("!")
        lines.append(f"router bgp {int(bgp['asn'])}")
        if bgp.get("router_id"):
            lines.append(f" bgp router-id {bgp['router_id']}")
        for neighbor in bgp.get("neighbors", []):
            address = neighbor["address"]
            lines.append(f" neighbor {address} remote-as {int(neighbor['remote_as'])}")
            if neighbor.get("description"):
                lines.append(f" neighbor {address} description {neighbor['description']}")
            if neighbor.get("update_source"):
                lines.append(f" neighbor {address} update-source {neighbor['update_source']}")
        for network in bgp.get("networks", []):
            prefix = ipaddress.ip_network(network["prefix"], strict=False)
            if prefix.version != 4:
                raise InventoryError("only IPv4 BGP networks are supported right now")
            lines.append(f" network {prefix.network_address} mask {prefix.netmask}")

    if routing.get("static") or ospf or eigrp or bgp:
        lines.append("!")


def render_vty(lines: list[str], defaults: dict[str, Any], device: dict[str, Any], has_local_users: bool) -> None:
    vty = {**defaults.get("vty", {}), **device.get("vty", {})}
    transport = vty.get("transport", "ssh")
    lines.append("line vty 0 4")
    if has_local_users:
        lines.append(" login local")
    else:
        lines.append(" no login")
    lines.append(f" transport input {transport}")
    lines.append("!")


def validate_inventory(inventory: dict[str, Any]) -> None:
    errors: list[str] = []
    errors.extend(validate_defaults(inventory.get("defaults", {})))
    devices = inventory.get("devices")
    if not isinstance(devices, list) or not devices:
        errors.append("devices must be a non-empty list")
    else:
        seen_hostnames = set()
        for index, device in enumerate(devices):
            if not isinstance(device, dict):
                errors.append(f"devices[{index}] must be an object")
                continue
            hostname = device.get("hostname")
            if not hostname or not isinstance(hostname, str):
                errors.append(f"devices[{index}].hostname is required")
            elif hostname in seen_hostnames:
                errors.append(f"duplicate hostname: {hostname}")
            else:
                seen_hostnames.add(hostname)
            errors.extend(validate_device_metadata(device, index))
            errors.extend(validate_spanning_tree(device, index))
            errors.extend(validate_dhcp(device, index))
            errors.extend(validate_acls(device, index))
            errors.extend(validate_vlans(device, index))
            errors.extend(validate_interfaces(device, index))
            errors.extend(validate_nat(device, index))
            errors.extend(validate_routing(device, index))

    if errors:
        raise InventoryError("\n".join(errors))


def validate_defaults(defaults: dict[str, Any]) -> list[str]:
    errors = []
    if defaults.get("domain_name"):
        errors.extend(validate_cli_safe(str(defaults["domain_name"]), "defaults.domain_name"))
    for key in ("name_servers", "ntp_servers"):
        for index, value in enumerate(defaults.get(key, [])):
            errors.extend(validate_cli_safe(str(value), f"defaults.{key}[{index}]"))
    for index, user in enumerate(defaults.get("local_users", [])):
        errors.extend(validate_user(user, f"defaults.local_users[{index}]"))
    if defaults.get("vty", {}).get("transport"):
        errors.extend(validate_cli_safe(str(defaults["vty"]["transport"]), "defaults.vty.transport"))
    return errors


def validate_device_metadata(device: dict[str, Any], device_index: int) -> list[str]:
    errors = []
    hostname = device.get("hostname")
    if isinstance(hostname, str) and not HOSTNAME_PATTERN.fullmatch(hostname):
        errors.append(f"devices[{device_index}].hostname contains invalid CLI characters")

    layer = device.get("device_layer", "L3")
    if str(layer).upper() not in DEVICE_LAYERS:
        errors.append(f"devices[{device_index}].device_layer must be L2 or L3")

    for key in ("role", "platform", "domain_name"):
        if device.get(key):
            errors.extend(validate_cli_safe(str(device[key]), f"devices[{device_index}].{key}"))

    for key in ("name_servers", "ntp_servers"):
        for item_index, value in enumerate(device.get(key, [])):
            errors.extend(validate_cli_safe(str(value), f"devices[{device_index}].{key}[{item_index}]"))

    for user_index, user in enumerate(device.get("local_users", [])):
        errors.extend(validate_user(user, f"devices[{device_index}].local_users[{user_index}]"))
    return errors


def validate_spanning_tree(device: dict[str, Any], device_index: int) -> list[str]:
    errors = []
    spanning_tree = device.get("spanning_tree", {})
    if not has_spanning_tree_config(spanning_tree):
        return errors
    if spanning_tree.get("mode") and spanning_tree["mode"] not in STP_MODES:
        errors.append(f"devices[{device_index}].spanning_tree.mode must be one of {sorted(STP_MODES)}")
    for index, item in enumerate(spanning_tree.get("vlan_priorities", [])):
        for vlan_id in item.get("vlans", []):
            errors.extend(validate_vlan_number(vlan_id, f"devices[{device_index}].spanning_tree.vlan_priorities[{index}].vlans"))
        try:
            priority = int(item["priority"])
            if priority < 0 or priority > 61440 or priority % 4096 != 0:
                errors.append(f"devices[{device_index}].spanning_tree.vlan_priorities[{index}].priority must be 0-61440 in 4096 steps")
        except (KeyError, TypeError, ValueError):
            errors.append(f"devices[{device_index}].spanning_tree.vlan_priorities[{index}].priority must be an integer")
    return errors


def validate_dhcp(device: dict[str, Any], device_index: int) -> list[str]:
    errors = []
    dhcp = device.get("dhcp", {})
    if not has_dhcp_config(dhcp):
        return errors
    if normalized_device_layer(device) == "L2":
        errors.append(f"devices[{device_index}].dhcp is not allowed on L2 devices")
    for index, item in enumerate(dhcp.get("excluded_addresses", [])):
        if isinstance(item, str):
            errors.extend(validate_ip_address(item, f"devices[{device_index}].dhcp.excluded_addresses[{index}]"))
        else:
            errors.extend(validate_ip_address(item.get("start"), f"devices[{device_index}].dhcp.excluded_addresses[{index}].start"))
            if item.get("end"):
                errors.extend(validate_ip_address(item["end"], f"devices[{device_index}].dhcp.excluded_addresses[{index}].end"))
    for index, pool in enumerate(dhcp.get("pools", [])):
        if pool.get("name"):
            errors.extend(validate_cli_safe(str(pool["name"]), f"devices[{device_index}].dhcp.pools[{index}].name"))
        else:
            errors.append(f"devices[{device_index}].dhcp.pools[{index}].name is required")
        errors.extend(validate_ip_network(pool.get("network"), f"devices[{device_index}].dhcp.pools[{index}].network"))
        if pool.get("default_router"):
            errors.extend(validate_ip_address(pool["default_router"], f"devices[{device_index}].dhcp.pools[{index}].default_router"))
        for server_index, server in enumerate(pool.get("dns_servers", [])):
            errors.extend(validate_ip_address(server, f"devices[{device_index}].dhcp.pools[{index}].dns_servers[{server_index}]"))
        if pool.get("domain_name"):
            errors.extend(validate_cli_safe(str(pool["domain_name"]), f"devices[{device_index}].dhcp.pools[{index}].domain_name"))
    return errors


def validate_acls(device: dict[str, Any], device_index: int) -> list[str]:
    errors = []
    for index, acl in enumerate(device.get("acls", [])):
        if acl.get("name"):
            errors.extend(validate_cli_safe(str(acl["name"]), f"devices[{device_index}].acls[{index}].name"))
        else:
            errors.append(f"devices[{device_index}].acls[{index}].name is required")
        acl_type = acl.get("type", "extended")
        if acl_type not in ACL_TYPES:
            errors.append(f"devices[{device_index}].acls[{index}].type must be standard or extended")
        for entry_index, entry in enumerate(acl.get("entries", [])):
            if entry.get("remark"):
                errors.extend(validate_cli_safe(str(entry["remark"]), f"devices[{device_index}].acls[{index}].entries[{entry_index}].remark"))
                continue
            if entry.get("action", "permit") not in ACL_ACTIONS:
                errors.append(f"devices[{device_index}].acls[{index}].entries[{entry_index}].action must be permit or deny")
            for key in ("protocol", "destination_port"):
                if entry.get(key):
                    errors.extend(validate_cli_safe(str(entry[key]), f"devices[{device_index}].acls[{index}].entries[{entry_index}].{key}"))
            errors.extend(validate_acl_endpoint(entry.get("source", "any"), f"devices[{device_index}].acls[{index}].entries[{entry_index}].source"))
            if acl_type == "extended":
                errors.extend(validate_acl_endpoint(entry.get("destination", "any"), f"devices[{device_index}].acls[{index}].entries[{entry_index}].destination"))
    return errors


def validate_vlans(device: dict[str, Any], device_index: int) -> list[str]:
    errors = []
    seen = set()
    for index, vlan in enumerate(device.get("vlans", [])):
        try:
            vlan_id = int(vlan["id"])
            if vlan_id < 1 or vlan_id > 4094:
                errors.append(f"devices[{device_index}].vlans[{index}].id must be 1-4094")
            if vlan_id in seen:
                errors.append(f"devices[{device_index}].vlans[{index}].id duplicates vlan {vlan_id}")
            seen.add(vlan_id)
        except (KeyError, TypeError, ValueError):
            errors.append(f"devices[{device_index}].vlans[{index}].id must be an integer")
        if vlan.get("name"):
            errors.extend(validate_cli_safe(str(vlan["name"]), f"devices[{device_index}].vlans[{index}].name"))
    return errors


def validate_interfaces(device: dict[str, Any], device_index: int) -> list[str]:
    errors = []
    seen = set()
    device_layer = normalized_device_layer(device)
    for index, interface in enumerate(device.get("interfaces", [])):
        name = interface.get("name") if isinstance(interface, dict) else None
        if not name:
            errors.append(f"devices[{device_index}].interfaces[{index}].name is required")
            continue
        if not INTERFACE_NAME_PATTERN.fullmatch(str(name)):
            errors.append(f"devices[{device_index}].interfaces[{index}].name contains invalid CLI characters")
        if name in seen:
            errors.append(f"devices[{device_index}].interfaces[{index}].name duplicates {name}")
        seen.add(name)

        mode = interface.get("mode", "routed")
        if mode not in INTERFACE_MODES:
            errors.append(f"devices[{device_index}].interfaces[{index}].mode must be one of {sorted(INTERFACE_MODES)}")
        if device_layer == "L2" and mode in {"routed", "loopback"}:
            errors.append(f"devices[{device_index}].interfaces[{index}].mode {mode} is not allowed on L2 devices")
        if mode in {"routed", "svi", "loopback"} and interface.get("address"):
            errors.extend(validate_ip_interface(interface["address"], f"devices[{device_index}].interfaces[{index}].address"))
        if mode == "access" and "access_vlan" not in interface:
            errors.append(f"devices[{device_index}].interfaces[{index}].access_vlan is required for access mode")
        if mode == "trunk" and interface.get("allowed_vlans"):
            for vlan_id in interface["allowed_vlans"]:
                errors.extend(validate_vlan_number(vlan_id, f"devices[{device_index}].interfaces[{index}].allowed_vlans"))
        if interface.get("description"):
            errors.extend(validate_cli_safe(str(interface["description"]), f"devices[{device_index}].interfaces[{index}].description"))
        if interface.get("channel_group"):
            try:
                group = int(interface["channel_group"])
                if group < 1:
                    errors.append(f"devices[{device_index}].interfaces[{index}].channel_group must be greater than 0")
            except (TypeError, ValueError):
                errors.append(f"devices[{device_index}].interfaces[{index}].channel_group must be an integer")
            if interface.get("channel_mode", "active") not in CHANNEL_MODES:
                errors.append(f"devices[{device_index}].interfaces[{index}].channel_mode must be one of {sorted(CHANNEL_MODES)}")
        if interface.get("nat_role"):
            if device_layer == "L2":
                errors.append(f"devices[{device_index}].interfaces[{index}].nat_role is not allowed on L2 devices")
            if interface["nat_role"] not in NAT_ROLES:
                errors.append(f"devices[{device_index}].interfaces[{index}].nat_role must be inside or outside")
        for helper_index, helper in enumerate(interface.get("helper_addresses", [])):
            errors.extend(validate_ip_address(helper, f"devices[{device_index}].interfaces[{index}].helper_addresses[{helper_index}]"))
        for group_index, group in enumerate(interface.get("hsrp", [])):
            if device_layer == "L2":
                errors.append(f"devices[{device_index}].interfaces[{index}].hsrp is not allowed on L2 devices")
            try:
                group_id = int(group["group"])
                if group_id < 0 or group_id > 255:
                    errors.append(f"devices[{device_index}].interfaces[{index}].hsrp[{group_index}].group must be 0-255")
            except (KeyError, TypeError, ValueError):
                errors.append(f"devices[{device_index}].interfaces[{index}].hsrp[{group_index}].group must be an integer")
            errors.extend(validate_ip_address(group.get("virtual_ip"), f"devices[{device_index}].interfaces[{index}].hsrp[{group_index}].virtual_ip"))
            if group.get("priority"):
                try:
                    priority = int(group["priority"])
                    if priority < 1 or priority > 255:
                        errors.append(f"devices[{device_index}].interfaces[{index}].hsrp[{group_index}].priority must be 1-255")
                except (TypeError, ValueError):
                    errors.append(f"devices[{device_index}].interfaces[{index}].hsrp[{group_index}].priority must be an integer")
        for acl_index, item in enumerate(interface.get("access_groups", [])):
            if item.get("direction") not in {"in", "out"}:
                errors.append(f"devices[{device_index}].interfaces[{index}].access_groups[{acl_index}].direction must be in or out")
            if item.get("name"):
                errors.extend(validate_cli_safe(str(item["name"]), f"devices[{device_index}].interfaces[{index}].access_groups[{acl_index}].name"))
            else:
                errors.append(f"devices[{device_index}].interfaces[{index}].access_groups[{acl_index}].name is required")
        port_security = interface.get("port_security")
        if port_security:
            try:
                maximum = int(port_security.get("maximum", 1))
                if maximum < 1:
                    errors.append(f"devices[{device_index}].interfaces[{index}].port_security.maximum must be greater than 0")
            except (TypeError, ValueError):
                errors.append(f"devices[{device_index}].interfaces[{index}].port_security.maximum must be an integer")
            if port_security.get("violation") and port_security["violation"] not in PORT_SECURITY_VIOLATIONS:
                errors.append(f"devices[{device_index}].interfaces[{index}].port_security.violation must be one of {sorted(PORT_SECURITY_VIOLATIONS)}")
    return errors


def validate_nat(device: dict[str, Any], device_index: int) -> list[str]:
    errors = []
    nat = device.get("nat", {})
    if not has_nat_config(nat):
        return errors
    if normalized_device_layer(device) == "L2":
        errors.append(f"devices[{device_index}].nat is not allowed on L2 devices")
    for index, item in enumerate(nat.get("inside_source", [])):
        if item.get("acl"):
            errors.extend(validate_cli_safe(str(item["acl"]), f"devices[{device_index}].nat.inside_source[{index}].acl"))
        else:
            errors.append(f"devices[{device_index}].nat.inside_source[{index}].acl is required")
        if item.get("interface"):
            if not INTERFACE_NAME_PATTERN.fullmatch(str(item["interface"])):
                errors.append(f"devices[{device_index}].nat.inside_source[{index}].interface contains invalid CLI characters")
        else:
            errors.append(f"devices[{device_index}].nat.inside_source[{index}].interface is required")
    return errors


def validate_routing(device: dict[str, Any], device_index: int) -> list[str]:
    errors = []
    routing = device.get("routing", {})
    device_layer = normalized_device_layer(device)
    for index, route in enumerate(routing.get("static", [])):
        try:
            destination = ipaddress.ip_network(route["destination"], strict=False)
            if destination.version != 4:
                errors.append(f"devices[{device_index}].routing.static[{index}].destination must be a valid IPv4 prefix")
            elif device_layer == "L2" and destination.prefixlen != 0:
                errors.append(f"devices[{device_index}].routing.static[{index}] is not allowed on L2 devices except 0.0.0.0/0")
        except (KeyError, ValueError):
            errors.append(f"devices[{device_index}].routing.static[{index}].destination must be a valid IPv4 prefix")
        errors.extend(validate_ip_address(route.get("next_hop"), f"devices[{device_index}].routing.static[{index}].next_hop"))

    for protocol in ("ospf", "eigrp", "bgp"):
        if device_layer == "L2" and routing.get(protocol):
            errors.append(f"devices[{device_index}].routing.{protocol} is not allowed on L2 devices")

    ospf = routing.get("ospf")
    if ospf:
        try:
            process_id = int(ospf.get("process_id", 1))
            if process_id < 1:
                errors.append(f"devices[{device_index}].routing.ospf.process_id must be greater than 0")
        except (TypeError, ValueError):
            errors.append(f"devices[{device_index}].routing.ospf.process_id must be an integer")
        if ospf.get("router_id"):
            errors.extend(validate_ip_address(ospf["router_id"], f"devices[{device_index}].routing.ospf.router_id"))
        for index, network in enumerate(ospf.get("networks", [])):
            errors.extend(validate_ip_network(network.get("prefix"), f"devices[{device_index}].routing.ospf.networks[{index}].prefix"))
            try:
                area = int(network.get("area", 0))
                if area < 0:
                    errors.append(f"devices[{device_index}].routing.ospf.networks[{index}].area must be 0 or greater")
            except (TypeError, ValueError):
                errors.append(f"devices[{device_index}].routing.ospf.networks[{index}].area must be an integer")

    eigrp = routing.get("eigrp")
    if eigrp:
        errors.extend(validate_asn(eigrp.get("asn"), f"devices[{device_index}].routing.eigrp.asn"))
        if eigrp.get("router_id"):
            errors.extend(validate_ip_address(eigrp["router_id"], f"devices[{device_index}].routing.eigrp.router_id"))
        for index, network in enumerate(eigrp.get("networks", [])):
            errors.extend(validate_ip_network(network.get("prefix"), f"devices[{device_index}].routing.eigrp.networks[{index}].prefix"))
        for index, interface in enumerate(eigrp.get("passive_interfaces", [])):
            if not INTERFACE_NAME_PATTERN.fullmatch(str(interface)):
                errors.append(f"devices[{device_index}].routing.eigrp.passive_interfaces[{index}] contains invalid CLI characters")

    bgp = routing.get("bgp")
    if bgp:
        errors.extend(validate_asn(bgp.get("asn"), f"devices[{device_index}].routing.bgp.asn"))
        if bgp.get("router_id"):
            errors.extend(validate_ip_address(bgp["router_id"], f"devices[{device_index}].routing.bgp.router_id"))
        for index, neighbor in enumerate(bgp.get("neighbors", [])):
            errors.extend(validate_ip_address(neighbor.get("address"), f"devices[{device_index}].routing.bgp.neighbors[{index}].address"))
            errors.extend(validate_asn(neighbor.get("remote_as"), f"devices[{device_index}].routing.bgp.neighbors[{index}].remote_as"))
            if neighbor.get("description"):
                errors.extend(validate_cli_safe(str(neighbor["description"]), f"devices[{device_index}].routing.bgp.neighbors[{index}].description"))
            if neighbor.get("update_source") and not INTERFACE_NAME_PATTERN.fullmatch(str(neighbor["update_source"])):
                errors.append(f"devices[{device_index}].routing.bgp.neighbors[{index}].update_source contains invalid CLI characters")
        for index, network in enumerate(bgp.get("networks", [])):
            errors.extend(validate_ip_network(network.get("prefix"), f"devices[{device_index}].routing.bgp.networks[{index}].prefix"))
    return errors


def validate_user(user: dict[str, Any], field: str) -> list[str]:
    errors = []
    name = user.get("name")
    if name and not USERNAME_PATTERN.fullmatch(str(name)):
        errors.append(f"{field}.name contains invalid CLI characters")
    for key in ("secret_type", "secret"):
        if user.get(key):
            errors.extend(validate_cli_safe(str(user[key]), f"{field}.{key}"))
    return errors


def validate_cli_safe(value: str, field: str) -> list[str]:
    if not CLI_SAFE_PATTERN.fullmatch(value):
        return [f"{field} contains Chinese or invalid CLI characters"]
    return []


def normalized_device_layer(device: dict[str, Any]) -> str:
    return str(device.get("device_layer", "L3")).upper()


def validate_ip_interface(value: str, field: str) -> list[str]:
    try:
        interface = ipaddress.ip_interface(str(value))
    except ValueError:
        return [f"{field} must be a valid IPv4 interface prefix, for example 10.0.0.1/24"]
    if interface.version != 4:
        return [f"{field} must be an IPv4 interface prefix"]
    return []


def validate_ip_address(value: Any, field: str) -> list[str]:
    try:
        address = ipaddress.ip_address(str(value))
    except ValueError:
        return [f"{field} must be a valid IPv4 address"]
    if address.version != 4:
        return [f"{field} must be an IPv4 address"]
    return []


def validate_ip_network(value: Any, field: str) -> list[str]:
    try:
        network = ipaddress.ip_network(str(value), strict=False)
    except ValueError:
        return [f"{field} must be a valid IPv4 prefix"]
    if network.version != 4:
        return [f"{field} must be an IPv4 prefix"]
    return []


def validate_acl_endpoint(value: Any, field: str) -> list[str]:
    text = str(value)
    if text == "any":
        return []
    try:
        if "/" in text:
            parsed = ipaddress.ip_network(text, strict=False)
        else:
            parsed = ipaddress.ip_address(text)
    except ValueError:
        return [f"{field} must be any, an IPv4 address, or an IPv4 prefix"]
    if parsed.version != 4:
        return [f"{field} must be any, an IPv4 address, or an IPv4 prefix"]
    return []


def validate_vlan_number(value: Any, field: str) -> list[str]:
    try:
        vlan_id = int(value)
    except (TypeError, ValueError):
        return [f"{field} must contain VLAN integers"]
    if vlan_id < 1 or vlan_id > 4094:
        return [f"{field} VLAN {vlan_id} must be 1-4094"]
    return []


def validate_asn(value: Any, field: str) -> list[str]:
    try:
        asn = int(value)
    except (TypeError, ValueError):
        return [f"{field} must be an integer"]
    if asn < 1 or asn > 4294967295:
        return [f"{field} must be 1-4294967295"]
    return []


def ios_address(value: str) -> tuple[str, str]:
    interface = ipaddress.ip_interface(value)
    if interface.version != 4:
        raise InventoryError("only IPv4 interface addresses are supported right now")
    return str(interface.ip), str(interface.network.netmask)


def wildcard_mask(prefix: ipaddress.IPv4Network) -> str:
    return str(prefix.hostmask)


def format_vlan_list(values: list[Any]) -> str:
    return ",".join(str(int(value)) for value in values)


def format_acl_entry(entry: dict[str, Any], acl_type: str) -> str:
    if entry.get("remark"):
        return f"remark {entry['remark']}"

    sequence = f"{int(entry['sequence'])} " if entry.get("sequence") else ""
    action = entry.get("action", "permit")
    source = format_acl_endpoint(entry.get("source", "any"))

    if acl_type == "standard":
        line = f"{sequence}{action} {source}"
    else:
        protocol = entry.get("protocol", "ip")
        destination = format_acl_endpoint(entry.get("destination", "any"))
        line = f"{sequence}{action} {protocol} {source} {destination}"
        if entry.get("destination_port"):
            line += f" eq {entry['destination_port']}"

    if entry.get("log"):
        line += " log"
    return line


def format_acl_endpoint(value: Any) -> str:
    text = str(value)
    if text == "any":
        return "any"
    if "/" in text:
        network = ipaddress.ip_network(text, strict=False)
        if network.version != 4:
            raise InventoryError("only IPv4 ACL endpoints are supported right now")
        if network.prefixlen == 32:
            return f"host {network.network_address}"
        return f"{network.network_address} {network.hostmask}"
    address = ipaddress.ip_address(text)
    if address.version != 4:
        raise InventoryError("only IPv4 ACL endpoints are supported right now")
    return f"host {text}"


def safe_filename(value: str) -> str:
    return SAFE_FILENAME_PATTERN.sub("_", value).strip("._") or "device"


def merge_lists(defaults: dict[str, Any], device: dict[str, Any], key: str) -> list[Any]:
    return list(defaults.get(key, [])) + list(device.get(key, []))


def resolve_env(value: str) -> str:
    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        return os.environ.get(name, f"__MISSING_ENV_{name}__")

    return ENV_PATTERN.sub(replace, value)


def require_string(mapping: dict[str, Any], key: str, context: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value:
        raise InventoryError(f"{context}.{key} must be a non-empty string")
    return value
