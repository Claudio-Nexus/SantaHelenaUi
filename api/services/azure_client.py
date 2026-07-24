import os
import re
import time
from urllib.parse import quote

import msal
import requests

_TABLE_CACHE: dict[tuple[str, str], tuple[float, list[dict]]] = {}
TABLE_CACHE_SECONDS = 300


def acquire_token(config: dict, scope: str) -> str:
    tenant_id = config.get("tenant_id") or os.environ.get("AZURE_TENANT_ID")
    client_id = config.get("client_id") or os.environ.get("AZURE_CLIENT_ID")
    client_secret = config.get("client_secret") or os.environ.get("AZURE_CLIENT_SECRET")
    missing = [
        name
        for name, value in {
            "AZURE_TENANT_ID": tenant_id,
            "AZURE_CLIENT_ID": client_id,
            "AZURE_CLIENT_SECRET": client_secret,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError(f"Credenciais Azure ausentes: {', '.join(missing)}")
    client = msal.ConfidentialClientApplication(
        client_id,
        authority=f"https://login.microsoftonline.com/{tenant_id}",
        client_credential=client_secret,
    )
    result = client.acquire_token_for_client(scopes=[scope])
    token = result.get("access_token")
    if not token:
        raise RuntimeError(result.get("error_description", "Nao foi possivel autenticar no Microsoft Entra ID."))
    return token


def upload_to_onelake(config: dict, relative_path: str, content: bytes) -> None:
    token = acquire_token(config, "https://storage.azure.com/.default")
    path = quote(relative_path, safe="/")
    item_id = str(config["lakehouse_id"])
    item_segment = item_id if re.fullmatch(r"[0-9a-fA-F-]{36}", item_id) else f"{item_id}.Lakehouse"
    base = f"https://onelake.dfs.fabric.microsoft.com/{config['workspace_id']}/{item_segment}/{path}"
    headers = {"Authorization": f"Bearer {token}", "x-ms-version": "2021-06-08"}
    _request("PUT", f"{base}?resource=file", headers=headers)
    _request("PATCH", f"{base}?action=append&position=0", headers=headers, data=content)
    _request("PATCH", f"{base}?action=flush&position={len(content)}", headers=headers)


def load_fabric_table(config: dict, table_name: str, relative_path: str, mode: str, file_format: str = "Csv") -> None:
    token = acquire_token(config, "https://api.fabric.microsoft.com/.default")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    lakehouse_url = (
        f"https://api.fabric.microsoft.com/v1/workspaces/{config['workspace_id']}"
        f"/lakehouses/{config['lakehouse_id']}"
    )
    lakehouse = _request("GET", lakehouse_url, headers=headers).json()
    default_schema = lakehouse.get("properties", {}).get("defaultSchema")
    if default_schema:
        url = (
            f"{lakehouse_url}/schemas/{quote(default_schema, safe='')}/tables/"
            f"{quote(table_name, safe='')}/load?beta=True"
        )
    else:
        url = f"{lakehouse_url}/tables/{quote(table_name, safe='')}/load"
    response = _request(
        "POST",
        url,
        headers=headers,
        json={
            "relativePath": relative_path,
            "pathType": "File",
            "mode": mode,
            "formatOptions": (
                {"header": True, "delimiter": ",", "format": "Csv"}
                if file_format == "Csv"
                else {"format": "Parquet"}
            ),
        },
    )
    operation_url = response.headers.get("Location")
    if not operation_url:
        raise RuntimeError("O Fabric nao retornou a operacao da carga.")
    for _ in range(60):
        status_response = _request("GET", operation_url, headers=headers)
        payload = status_response.json()
        status = payload.get("status", payload.get("Status"))
        if status in {3, "Succeeded", "Completed"}:
            return
        if status in {4, "Failed"}:
            raise RuntimeError(f"A carga no Fabric falhou: {payload.get('error') or payload.get('Error')}")
        time.sleep(2)
    raise RuntimeError("A carga no Fabric excedeu o tempo limite.")


def import_power_bi(config: dict, workspace_id: str, file_name: str, report_name: str, content: bytes, replace: bool) -> dict:
    token = acquire_token(config, "https://analysis.windows.net/powerbi/api/.default")
    url = f"https://api.powerbi.com/v1.0/myorg/groups/{workspace_id}/imports"
    response = _request(
        "POST",
        url,
        headers={"Authorization": f"Bearer {token}"},
        params={"datasetDisplayName": report_name, "nameConflict": "Overwrite" if replace else "Abort"},
        files={"file": (file_name, content, "application/octet-stream")},
    )
    return response.json()


def check_fabric_connection(config: dict) -> dict:
    token = acquire_token(config, "https://api.fabric.microsoft.com/.default")
    url = (
        f"https://api.fabric.microsoft.com/v1/workspaces/{config['workspace_id']}"
        f"/lakehouses/{config['lakehouse_id']}/tables"
    )
    response = _request("GET", url, headers={"Authorization": f"Bearer {token}"})
    payload = response.json()
    return {"table_count": len(payload.get("data", []))}


def check_power_bi_connection(config: dict) -> dict:
    token = acquire_token(config, "https://analysis.windows.net/powerbi/api/.default")
    response = _request(
        "GET",
        "https://api.powerbi.com/v1.0/myorg/groups",
        headers={"Authorization": f"Bearer {token}"},
    )
    workspaces = response.json().get("value", [])
    accessible_ids = {workspace.get("id") for workspace in workspaces}
    configured = config.get("workspaces", [])
    missing = [workspace["id"] for workspace in configured if workspace["id"] not in accessible_ids]
    return {"workspace_count": len(workspaces), "configured_missing": missing}


def get_onelake_table(config: dict, table_name: str) -> dict | None:
    cache_key = (str(config["workspace_id"]), str(config["lakehouse_id"]))
    cached = _TABLE_CACHE.get(cache_key)
    if cached and time.monotonic() - cached[0] < TABLE_CACHE_SECONDS:
        return next(
            (table for table in cached[1] if table.get("name", "").split(".")[-1].lower() == table_name.lower()),
            None,
        )
    token = acquire_token(config, "https://storage.azure.com/.default")
    base = (
        f"https://onelake.table.fabric.microsoft.com/delta/{config['workspace_id']}"
        f"/{config['lakehouse_id']}/api/2.1/unity-catalog/tables"
    )
    headers = {"Authorization": f"Bearer {token}"}
    schemas_response = _request(
        "GET",
        base.replace("/tables", "/schemas"),
        headers=headers,
        params={"catalog_name": config["lakehouse_id"]},
    )
    schemas = schemas_response.json().get("schemas") or []
    schema_names = [item.get("name", "").split(".")[-1] for item in schemas] or ["dbo"]
    all_tables = []
    for schema_name in schema_names:
        response = _request(
            "GET",
            base,
            headers=headers,
            params={"catalog_name": config["lakehouse_id"], "schema_name": schema_name},
        )
        all_tables.extend(response.json().get("tables") or [])
    _TABLE_CACHE[cache_key] = (time.monotonic(), all_tables)
    return next(
        (table for table in all_tables if table.get("name", "").split(".")[-1].lower() == table_name.lower()),
        None,
    )


def _request(method: str, url: str, **kwargs) -> requests.Response:
    response = requests.request(method, url, timeout=120, **kwargs)
    if not response.ok:
        detail = response.text[:1000]
        raise RuntimeError(f"Microsoft API retornou HTTP {response.status_code}: {detail}")
    return response
