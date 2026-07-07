# Cisco Config Generator

Small starter project for generating Cisco IOS-style configuration from structured inventory.

## Workflow

1. Edit `inventory/devices.json`.
2. Generate configs:

   ```bash
   python -m configgen
   ```

3. Review the files in `generated-configs/`.
4. Commit both inventory and generated configs to GitHub.

GitHub Actions runs unit tests and verifies that generated configs are current on every push and pull request.

## Inventory Model

The starter supports:

- global defaults for DNS, NTP, SSH, VTY, and local users
- VLAN definitions
- routed interfaces
- access ports with optional voice VLAN
- trunk ports with native and allowed VLANs
- SVIs
- loopbacks
- IPv4 static routes
- simple OSPF network statements

Secrets can be referenced as environment variables using `${NAME}`. If the variable is missing, the generated config includes `__MISSING_ENV_NAME__` so it is obvious before deployment.

## Useful Commands

```bash
python -m unittest discover -s tests -p 'test*.py'
python -m configgen
python -m configgen --check
```

## GitHub Setup

From this directory:

```bash
git init
git add .
git commit -m "Add Cisco config generator"
gh repo create cisco-config-generator --private --source . --push
```

If you do not use GitHub CLI, create an empty repository in GitHub, then add it as `origin` and push.
