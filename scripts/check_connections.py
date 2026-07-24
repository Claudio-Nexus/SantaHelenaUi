import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api.services.app_config import get_power_bi_config, get_storage_config
from api.services.azure_client import check_fabric_connection, check_power_bi_connection


def main() -> int:
    checks = [
        ("Fabric/OneLake", check_fabric_connection, get_storage_config()),
        ("Power BI", check_power_bi_connection, get_power_bi_config()),
    ]
    failed = False
    for label, check, config in checks:
        try:
            result = check(config)
            if result.get("configured_missing"):
                failed = True
                print(f"[FALHA] {label}: workspaces configurados sem acesso: {', '.join(result['configured_missing'])}")
            else:
                detail = (
                    f"{result['table_count']} tabela(s) visivel(is)"
                    if "table_count" in result
                    else f"{result['workspace_count']} workspace(s) visivel(is)"
                )
                print(f"[OK] {label}: {detail}")
        except Exception as exc:
            failed = True
            print(f"[FALHA] {label}: {exc}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
