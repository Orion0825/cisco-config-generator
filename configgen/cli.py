from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .generator import InventoryError, load_inventory, render_inventory


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate Cisco IOS configs from JSON inventory.")
    parser.add_argument("--inventory", default="inventory/devices.json", help="Path to inventory JSON.")
    parser.add_argument("--output", default="generated-configs", help="Directory for generated .cfg files.")
    parser.add_argument("--check", action="store_true", help="Fail if generated configs differ from output files.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    inventory_path = Path(args.inventory)
    output_dir = Path(args.output)

    try:
        inventory = load_inventory(inventory_path)
        rendered = render_inventory(inventory)
        if args.check:
            return check_output(output_dir, rendered)
        write_output(output_dir, rendered)
    except InventoryError as exc:
        print(f"configgen: {exc}", file=sys.stderr)
        return 2

    print(f"Generated {len(rendered)} config file(s) in {output_dir}")
    return 0


def write_output(output_dir: Path, rendered: dict[str, str]) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    for filename, content in rendered.items():
        target = output_dir / filename
        target.write_text(content, encoding="utf-8")


def check_output(output_dir: Path, rendered: dict[str, str]) -> int:
    errors = []
    expected_files = set(rendered)
    existing_files = {path.name for path in output_dir.glob("*.cfg")} if output_dir.exists() else set()

    for filename, content in rendered.items():
        target = output_dir / filename
        if not target.exists():
            errors.append(f"missing generated config: {target}")
            continue
        if target.read_text(encoding="utf-8") != content:
            errors.append(f"stale generated config: {target}")

    for filename in sorted(existing_files - expected_files):
        errors.append(f"unexpected generated config: {output_dir / filename}")

    if errors:
        print("Generated configs are not current:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        print("Run: python -m configgen", file=sys.stderr)
        return 1

    print("Generated configs are current.")
    return 0
