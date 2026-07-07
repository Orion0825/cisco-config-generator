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


if __name__ == "__main__":
    unittest.main()
