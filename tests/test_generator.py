import unittest

from configgen.generator import InventoryError, ios_address, render_inventory, validate_inventory


class GeneratorTest(unittest.TestCase):
    def test_ios_address_converts_prefix_to_netmask(self):
        self.assertEqual(ios_address("10.10.10.1/24"), ("10.10.10.1", "255.255.255.0"))

    def test_render_inventory_outputs_one_file_per_device(self):
        inventory = {
            "devices": [
                {
                    "hostname": "R1",
                    "interfaces": [
                        {"name": "GigabitEthernet0/0", "mode": "routed", "address": "10.0.0.1/30"}
                    ],
                }
            ]
        }

        rendered = render_inventory(inventory)

        self.assertEqual(set(rendered), {"R1.cfg"})
        self.assertIn("hostname R1", rendered["R1.cfg"])
        self.assertIn("ip address 10.0.0.1 255.255.255.252", rendered["R1.cfg"])

    def test_validate_inventory_rejects_duplicate_hostname(self):
        inventory = {"devices": [{"hostname": "R1"}, {"hostname": "R1"}]}

        with self.assertRaises(InventoryError):
            validate_inventory(inventory)

    def test_render_l2_default_route_as_default_gateway(self):
        inventory = {
            "devices": [
                {
                    "hostname": "SW1",
                    "device_layer": "L2",
                    "interfaces": [{"name": "Vlan10", "mode": "svi", "address": "10.10.10.2/24"}],
                    "routing": {"static": [{"destination": "0.0.0.0/0", "next_hop": "10.10.10.1"}]},
                }
            ]
        }

        rendered = render_inventory(inventory)

        self.assertIn("ip default-gateway 10.10.10.1", rendered["SW1.cfg"])
        self.assertNotIn("ip route 0.0.0.0", rendered["SW1.cfg"])

    def test_validate_inventory_rejects_chinese_cli_text(self):
        inventory = {"devices": [{"hostname": "核心SW1"}]}

        with self.assertRaises(InventoryError):
            validate_inventory(inventory)

    def test_render_eigrp_and_bgp(self):
        inventory = {
            "devices": [
                {
                    "hostname": "EDGE-R1",
                    "device_layer": "L3",
                    "routing": {
                        "eigrp": {
                            "asn": 100,
                            "router_id": "10.255.0.1",
                            "networks": [{"prefix": "10.10.0.0/16"}],
                            "passive_interfaces": ["GigabitEthernet0/1"],
                        },
                        "bgp": {
                            "asn": 65001,
                            "router_id": "10.255.0.1",
                            "neighbors": [{"address": "203.0.113.1", "remote_as": 65000}],
                            "networks": [{"prefix": "203.0.113.0/30"}],
                        },
                    },
                }
            ]
        }

        rendered = render_inventory(inventory)["EDGE-R1.cfg"]

        self.assertIn("router eigrp 100", rendered)
        self.assertIn(" network 10.10.0.0 0.0.255.255", rendered)
        self.assertIn(" passive-interface GigabitEthernet0/1", rendered)
        self.assertIn("router bgp 65001", rendered)
        self.assertIn(" neighbor 203.0.113.1 remote-as 65000", rendered)
        self.assertIn(" network 203.0.113.0 mask 255.255.255.252", rendered)

    def test_validate_inventory_rejects_dynamic_routing_on_l2(self):
        inventory = {
            "devices": [
                {
                    "hostname": "SW1",
                    "device_layer": "L2",
                    "routing": {"bgp": {"asn": 65001}},
                }
            ]
        }

        with self.assertRaises(InventoryError):
            validate_inventory(inventory)

    def test_validate_empty_advanced_objects_on_l2(self):
        inventory = {
            "devices": [
                {
                    "hostname": "SW1",
                    "device_layer": "L2",
                    "spanning_tree": {"vlan_priorities": []},
                    "dhcp": {"excluded_addresses": [], "pools": []},
                    "nat": {"inside_source": []},
                    "acls": [],
                }
            ]
        }

        validate_inventory(inventory)

    def test_validate_acl_rejects_ipv6_endpoint(self):
        inventory = {
            "devices": [
                {
                    "hostname": "R1",
                    "acls": [
                        {
                            "name": "BAD",
                            "type": "extended",
                            "entries": [{"action": "permit", "protocol": "ip", "source": "2001:db8::1", "destination": "any"}],
                        }
                    ],
                }
            ]
        }

        with self.assertRaises(InventoryError):
            validate_inventory(inventory)

    def test_render_common_routing_and_switching_features(self):
        inventory = {
            "devices": [
                {
                    "hostname": "EDGE-SW1",
                    "device_layer": "L3",
                    "spanning_tree": {"mode": "rapid-pvst", "portfast_default": True},
                    "acls": [
                        {
                            "name": "INSIDE-NAT",
                            "type": "extended",
                            "entries": [{"action": "permit", "protocol": "ip", "source": "10.10.10.0/24", "destination": "any"}],
                        }
                    ],
                    "dhcp": {
                        "excluded_addresses": [{"start": "10.10.10.1", "end": "10.10.10.20"}],
                        "pools": [{"name": "USERS", "network": "10.10.10.0/24", "default_router": "10.10.10.1"}],
                    },
                    "interfaces": [
                        {
                            "name": "GigabitEthernet0/0",
                            "mode": "routed",
                            "address": "203.0.113.2/30",
                            "nat_role": "outside",
                        },
                        {
                            "name": "Vlan10",
                            "mode": "svi",
                            "address": "10.10.10.2/24",
                            "nat_role": "inside",
                            "helper_addresses": ["10.10.10.10"],
                            "hsrp": [{"group": 10, "virtual_ip": "10.10.10.1", "priority": 110, "preempt": True}],
                        },
                        {
                            "name": "GigabitEthernet0/1",
                            "mode": "access",
                            "access_vlan": 10,
                            "channel_group": 1,
                            "port_security": {"maximum": 2, "violation": "restrict", "sticky": True},
                            "spanning_tree_bpduguard": True,
                        },
                    ],
                    "nat": {"inside_source": [{"acl": "INSIDE-NAT", "interface": "GigabitEthernet0/0", "overload": True}]},
                }
            ]
        }

        rendered = render_inventory(inventory)["EDGE-SW1.cfg"]

        self.assertIn("spanning-tree mode rapid-pvst", rendered)
        self.assertIn("ip dhcp pool USERS", rendered)
        self.assertIn("ip access-list extended INSIDE-NAT", rendered)
        self.assertIn("ip nat outside", rendered)
        self.assertIn("ip nat inside", rendered)
        self.assertIn("ip nat inside source list INSIDE-NAT interface GigabitEthernet0/0 overload", rendered)
        self.assertIn("standby 10 ip 10.10.10.1", rendered)
        self.assertIn("ip helper-address 10.10.10.10", rendered)
        self.assertIn("channel-group 1 mode active", rendered)
        self.assertIn("switchport port-security maximum 2", rendered)


if __name__ == "__main__":
    unittest.main()
