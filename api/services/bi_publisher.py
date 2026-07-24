import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from api.schemas import BiPublishCommit, BiPublishHistoryItem, BiPublishPreview, BiWorkspaceItem
from api.services.app_config import get_power_bi_config
from api.services.azure_client import import_power_bi

BI_STORAGE_ROOT = Path("storage/bi-publications")


def list_workspaces() -> list[BiWorkspaceItem]:
    return [BiWorkspaceItem(**workspace) for workspace in get_power_bi_config()["workspaces"]]


def preview_bi_publish(file_name: str, workspace_id: str, report_name: str | None = None) -> BiPublishPreview:
    if not file_name.lower().endswith(".pbix"):
        raise ValueError("Envie um arquivo PBIX para publicacao de BI.")

    workspace = find_workspace(workspace_id)
    if workspace is None:
        raise ValueError("Workspace nao encontrada na configuracao local.")

    clean_report_name = (report_name or Path(file_name).stem).replace("_", " ").replace("-", " ").strip()
    has_workspace_access = workspace["user_role"] in {"Admin", "Membro"}
    has_publish_permission = bool(workspace["can_publish"])
    is_report_authorized = is_authorized_report(clean_report_name)
    can_publish = has_workspace_access and has_publish_permission and is_report_authorized

    if can_publish:
        status = "ready"
        message = "Validacao aprovada. A publicacao pode ser executada pelo usuario de servico."
    else:
        status = "blocked"
        message = "Publicacao bloqueada: falta acesso, permissao de publicacao ou autorizacao para esse relatorio."

    return BiPublishPreview(
        file_name=file_name,
        report_name=clean_report_name,
        workspace_id=workspace["id"],
        workspace_name=workspace["name"],
        user_role=workspace["user_role"],
        has_workspace_access=has_workspace_access,
        has_publish_permission=has_publish_permission,
        is_report_authorized=is_report_authorized,
        status=status,
        message=message,
    )


def commit_bi_publish(
    file_name: str, content: bytes, workspace_id: str, requested_by: str,
    report_name: str | None = None, publish_mode: str = "replace",
) -> BiPublishCommit:
    preview = preview_bi_publish(file_name, workspace_id, report_name)
    if preview.status == "blocked":
        raise ValueError(preview.message)

    publish_id = uuid4().hex
    power_bi_config = get_power_bi_config()
    if power_bi_config.get("provider") == "power_bi_rest":
        import_power_bi(
            power_bi_config,
            preview.workspace_id,
            Path(file_name).name,
            preview.report_name,
            content,
            replace=publish_mode == "replace",
        )
    output_dir = BI_STORAGE_ROOT / preview.workspace_id / publish_id
    output_dir.mkdir(parents=True, exist_ok=True)

    safe_file_name = Path(file_name).name
    pbix_path = output_dir / safe_file_name
    manifest_path = output_dir / "manifest.json"
    pbix_path.write_bytes(content)

    manifest = {
        "publish_id": publish_id,
        "file_name": safe_file_name,
        "report_name": preview.report_name,
        "workspace_id": preview.workspace_id,
        "workspace_name": preview.workspace_name,
        "requested_by": requested_by,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "completed",
        "output_path": str(output_dir),
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    return BiPublishCommit(
        publish_id=publish_id,
        file_name=safe_file_name,
        report_name=preview.report_name,
        workspace_id=preview.workspace_id,
        workspace_name=preview.workspace_name,
        status="completed",
        message="Publicacao concluida com sucesso.",
        output_path=str(output_dir),
    )


def list_bi_publish_history(limit: int = 50) -> list[BiPublishHistoryItem]:
    if not BI_STORAGE_ROOT.exists():
        return []

    items = []
    for manifest_path in BI_STORAGE_ROOT.glob("*/*/manifest.json"):
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            items.append(BiPublishHistoryItem(**manifest))
        except (OSError, KeyError, json.JSONDecodeError, TypeError):
            continue

    return sorted(items, key=lambda item: item.created_at, reverse=True)[:limit]


def find_workspace(workspace_id: str) -> dict | None:
    return next((workspace for workspace in get_power_bi_config()["workspaces"] if workspace["id"] == workspace_id), None)


def is_authorized_report(report_name: str) -> bool:
    normalized = report_name.strip().lower()
    prefixes = get_power_bi_config()["authorized_report_prefixes"]
    return any(normalized.startswith(prefix.lower()) for prefix in prefixes)
