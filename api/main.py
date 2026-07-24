from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import json

from api.schemas import (
    BiPublishCommit,
    BiPublishHistoryItem,
    BiPublishPreview,
    BiWorkspaceItem,
    CurrentUser,
    DataLoadCommit,
    DataLoadHistoryItem,
    DataLoadPreview,
    RegisteredTableItem,
)
from api.services.auth import get_request_user, require_role
from api.services.app_config import get_cors_origins
from api.services.file_reader import read_file_preview
from api.services.lakehouse_writer import list_lakehouse_history, list_registered_tables, write_lakehouse
from api.services.schema_detector import build_preview
from api.services.bi_publisher import commit_bi_publish, list_bi_publish_history, list_workspaces, preview_bi_publish
from api.services.azure_client import get_onelake_table
from api.services.app_config import get_storage_config
from api.services.normalize import normalize_columns, technical_name_from_file

app = FastAPI(title="Santa Helena Data Portal API")
DIST_PATH = Path("dist")
MAX_DATA_FILE_BYTES = 50 * 1024 * 1024
MAX_PBIX_FILE_BYTES = 1024 * 1024 * 1024


async def read_upload(file: UploadFile, maximum: int) -> bytes:
    content = await file.read(maximum + 1)
    if len(content) > maximum:
        raise HTTPException(status_code=413, detail="O arquivo excede o limite permitido.")
    if not content:
        raise HTTPException(status_code=400, detail="O arquivo enviado esta vazio.")
    return content

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/me", response_model=CurrentUser)
def current_user(request: Request) -> CurrentUser:
    return get_request_user(request)


@app.post("/api/data-loads/preview", response_model=DataLoadPreview)
async def preview_data_load(
    request: Request, file: UploadFile = File(...), table_name: str | None = Form(None)
) -> DataLoadPreview:
    try:
        require_role(request, "data-loader")
        content = await read_upload(file, MAX_DATA_FILE_BYTES)
        file_preview = read_file_preview(file.filename or "arquivo", content)
        preview = build_preview(file_preview)
        if table_name:
            clean_table_name = technical_name_from_file(table_name)
            preview = preview.model_copy(update={"table_name": clean_table_name, "friendly_name": clean_table_name})
        return preview
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro ao ler arquivo: {exc}") from exc


@app.post("/api/tables/inspect")
def inspect_table(request: Request, table_name: str = Form(...), columns: str = Form("[]")) -> dict:
    require_role(request, "data-loader")
    clean_table_name = technical_name_from_file(table_name)
    try:
        incoming_columns = json.loads(columns)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail="Lista de colunas invalida.") from exc
    storage_config = get_storage_config()
    if storage_config.get("provider") != "fabric":
        return {"table_name": clean_table_name, "status": "new", "message": "Tabela ainda nao cadastrada."}
    try:
        remote = get_onelake_table(storage_config, clean_table_name)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Nao foi possivel consultar o catalogo do Fabric: {exc}") from exc
    if not remote:
        return {
            "table_name": clean_table_name,
            "status": "new",
            "message": "A tabela nao existe no Fabric e sera criada na confirmacao.",
        }
    remote_columns = [column.get("name") for column in (remote.get("columns") or []) if column.get("name")]
    same_structure = not remote_columns or normalize_columns(remote_columns) == normalize_columns(incoming_columns)
    return {
        "table_name": clean_table_name,
        "status": "ready" if same_structure else "blocked",
        "message": (
            "A tabela existe no Fabric e possui as mesmas colunas. A carga pode seguir."
            if same_structure
            else "A tabela existe no Fabric, mas suas colunas sao diferentes do arquivo enviado."
        ),
        "remote_columns": remote_columns,
    }


@app.get("/api/data-loads/history", response_model=list[DataLoadHistoryItem])
def data_load_history(request: Request) -> list[DataLoadHistoryItem]:
    require_role(request, "data-loader")
    return list_lakehouse_history()


@app.get("/api/tables", response_model=list[RegisteredTableItem])
def registered_tables(request: Request) -> list[RegisteredTableItem]:
    require_role(request, "data-loader")
    return list_registered_tables()


@app.post("/api/data-loads/commit", response_model=DataLoadCommit)
async def commit_data_load(
    request: Request,
    file: UploadFile = File(...),
    frequency: str = Form(...),
    reference_column: str | None = Form(None),
    load_strategy: str = Form(...),
    table_name: str = Form(...),
    column_types: str = Form("{}"),
) -> DataLoadCommit:
    try:
        user = require_role(request, "data-loader")
        if frequency not in {"once", "daily", "monthly"}:
            raise HTTPException(status_code=422, detail="Frequencia invalida.")
        if load_strategy not in {"replace_period", "replace_all", "merge_key"}:
            raise HTTPException(status_code=422, detail="Estrategia de carga invalida.")
        if frequency != "once" and not reference_column:
            raise HTTPException(status_code=422, detail="Informe a coluna de referencia.")
        clean_table_name = technical_name_from_file(table_name)
        try:
            parsed_column_types = json.loads(column_types)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=422, detail="Tipos de coluna invalidos.") from exc
        content = await read_upload(file, MAX_DATA_FILE_BYTES)
        file_preview = read_file_preview(file.filename or "arquivo", content)
        preview = build_preview(file_preview)
        preview = preview.model_copy(update={"table_name": clean_table_name})
        storage_config = get_storage_config()
        if storage_config.get("provider") == "fabric":
            remote = get_onelake_table(storage_config, clean_table_name)
            remote_columns = [column.get("name") for column in ((remote or {}).get("columns") or []) if column.get("name")]
            if remote and remote_columns and normalize_columns(remote_columns) != normalize_columns(file_preview.columns):
                raise HTTPException(
                    status_code=409,
                    detail="A estrutura da tabela no Fabric mudou desde a conferencia. Refaça o preview antes de confirmar.",
                )
        return write_lakehouse(
            file_preview, preview, frequency, reference_column, load_strategy, user.email, parsed_column_types
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro ao gravar carga: {exc}") from exc


@app.get("/api/bi/workspaces", response_model=list[BiWorkspaceItem])
def bi_workspaces(request: Request) -> list[BiWorkspaceItem]:
    require_role(request, "bi-publisher")
    return list_workspaces()


@app.get("/api/bi/history", response_model=list[BiPublishHistoryItem])
def bi_history(request: Request) -> list[BiPublishHistoryItem]:
    require_role(request, "bi-publisher")
    return list_bi_publish_history()


@app.post("/api/bi/preview", response_model=BiPublishPreview)
async def preview_bi(
    request: Request,
    file: UploadFile = File(...),
    workspace_id: str = Form(""),
    report_name: str | None = Form(None),
) -> BiPublishPreview:
    try:
        require_role(request, "bi-publisher")
        return preview_bi_publish(file.filename or "relatorio.pbix", workspace_id, report_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro ao validar publicacao: {exc}") from exc


@app.post("/api/bi/commit", response_model=BiPublishCommit)
async def commit_bi(
    request: Request,
    file: UploadFile = File(...),
    workspace_id: str = Form(""),
    report_name: str | None = Form(None),
    publish_mode: str = Form("replace"),
) -> BiPublishCommit:
    try:
        user = require_role(request, "bi-publisher")
        if publish_mode not in {"replace", "new"}:
            raise HTTPException(status_code=422, detail="Modo de publicacao invalido.")
        content = await read_upload(file, MAX_PBIX_FILE_BYTES)
        return commit_bi_publish(
            file.filename or "relatorio.pbix", content, workspace_id, user.email, report_name, publish_mode
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro ao publicar BI: {exc}") from exc


if DIST_PATH.exists():
    app.mount("/assets", StaticFiles(directory=DIST_PATH / "assets"), name="assets")


@app.get("/{route_path:path}", include_in_schema=False)
def serve_frontend(route_path: str):
    if route_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Rota de API nao encontrada.")

    index_path = DIST_PATH / "index.html"
    requested_path = DIST_PATH / route_path

    if requested_path.is_file():
        return FileResponse(requested_path)

    if index_path.exists():
        return FileResponse(index_path)

    raise HTTPException(status_code=404, detail="Frontend nao encontrado. Execute npm run build antes do deploy.")
