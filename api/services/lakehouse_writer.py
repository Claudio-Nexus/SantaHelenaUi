import json
from decimal import Decimal, InvalidOperation
from io import BytesIO, StringIO
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from api.schemas import DataLoadCommit, DataLoadHistoryItem, DataLoadPreview
from api.schemas import RegisteredTableItem
from api.services.catalog_service import list_registered_catalog_tables
from api.services.file_reader import FilePreview
from api.services.app_config import get_storage_config
from api.services.azure_client import load_fabric_table, upload_to_onelake
from api.services.normalize import normalize_columns


def storage_root() -> Path:
    return Path(get_storage_config().get("root", "storage/lakehouse"))


def decimal_without_exponent(value: float) -> str:
    return format(Decimal(str(value)), "f")


def dataframe_to_csv(dataframe, target, **kwargs) -> None:
    dataframe.to_csv(target, float_format=decimal_without_exponent, **kwargs)


DECIMAL_SCALE = 18
DECIMAL_PRECISION = 38
DECIMAL_QUANTIZER = Decimal("1").scaleb(-DECIMAL_SCALE)


def dataframe_to_parquet(dataframe, target, column_types: dict[str, str]) -> None:
    fields = []
    arrays = []
    for column in dataframe.columns:
        selected = column_types[column]
        if selected == "decimal":
            arrow_type = pa.decimal128(DECIMAL_PRECISION, DECIMAL_SCALE)
            values = [None if pd.isna(value) else value for value in dataframe[column]]
            arrays.append(pa.array(values, type=arrow_type))
        else:
            array = pa.Array.from_pandas(dataframe[column])
            arrow_type = array.type
            arrays.append(array)
        fields.append(pa.field(column, arrow_type, nullable=True))
    table = pa.Table.from_arrays(arrays, schema=pa.schema(fields))
    pq.write_table(table, target)


def write_lakehouse(
    file_preview: FilePreview,
    preview: DataLoadPreview,
    frequency: str,
    reference_column: str | None,
    load_strategy: str,
    requested_by: str,
    column_types: dict[str, str],
) -> DataLoadCommit:
    if preview.status == "blocked":
        raise ValueError(preview.message)

    load_id = uuid4().hex
    storage_config = get_storage_config()
    normalized_dataframe = file_preview.dataframe.copy()
    normalized_headers = normalize_columns(list(normalized_dataframe.columns))
    if len(normalized_headers) != len(normalized_dataframe.columns) or any(not name for name in normalized_headers):
        raise ValueError("Uma ou mais colunas nao possuem um nome valido para o Lakehouse.")
    duplicates = sorted({name for name in normalized_headers if normalized_headers.count(name) > 1})
    if duplicates:
        raise ValueError(
            "Colunas duplicadas depois da normalizacao: " + ", ".join(duplicates)
        )
    normalized_dataframe.columns = normalized_headers
    normalized_type_map = {
        normalize_columns([column])[0]: column_type for column, column_type in column_types.items()
    }
    normalized_dataframe = coerce_dataframe_types(normalized_dataframe, normalized_type_map)
    if storage_config.get("provider") == "fabric":
        if load_strategy != "replace_all":
            raise ValueError(
                "O provider Fabric atual aceita somente substituicao completa. "
                "Carga por periodo e merge exigem uma operacao transacional configurada."
            )
        parquet_buffer = BytesIO()
        dataframe_to_parquet(normalized_dataframe, parquet_buffer, normalized_type_map)
        relative_path = f"Files/portal-loads/{preview.table_name}/{load_id}.parquet"
        upload_to_onelake(storage_config, relative_path, parquet_buffer.getvalue())
        load_fabric_table(storage_config, preview.table_name, relative_path, "Overwrite", "Parquet")

    table_dir = storage_root() / preview.table_name
    load_dir = table_dir / load_id
    load_dir.mkdir(parents=True, exist_ok=True)

    data_path = load_dir / "data.csv"
    schema_path = load_dir / "schema.json"
    manifest_path = load_dir / "manifest.json"

    dataframe_to_csv(normalized_dataframe, data_path, index=False, encoding="utf-8-sig")
    schema_path.write_text(
        json.dumps([column.model_dump() for column in preview.columns], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    manifest = {
        "load_id": load_id,
        "table_name": preview.table_name,
        "dataset_kind": preview.dataset_kind,
        "source_file": preview.file_name,
        "sheet_name": preview.sheet_name,
        "row_count": preview.row_count,
        "column_count": preview.column_count,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "data_path": str(data_path),
        "schema_path": str(schema_path),
        "frequency": frequency,
        "reference_column": reference_column,
        "load_strategy": load_strategy,
        "requested_by": requested_by,
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    return DataLoadCommit(
        load_id=load_id,
        table_name=preview.table_name,
        dataset_kind=preview.dataset_kind,
        status="completed",
        message="Carga concluida com sucesso.",
        row_count=preview.row_count,
        column_count=preview.column_count,
        output_path=str(load_dir),
        frequency=frequency,
        reference_column=reference_column,
        load_strategy=load_strategy,
        requested_by=requested_by,
    )


def coerce_dataframe_types(dataframe, column_types: dict[str, str]):
    allowed = {"text", "integer", "decimal", "boolean", "date", "datetime"}
    result = dataframe.copy()
    for column in result.columns:
        selected = column_types.get(column)
        if selected not in allowed:
            raise ValueError(f"Selecione um tipo valido para a coluna {column}.")
        try:
            if selected == "text":
                result[column] = result[column].astype("string")
            elif selected == "integer":
                result[column] = pd.to_numeric(result[column], errors="raise").astype("Int64")
            elif selected == "decimal":
                def to_fixed_decimal(value):
                    if value is None or pd.isna(value):
                        return None
                    decimal_value = Decimal(str(value)).quantize(DECIMAL_QUANTIZER)
                    integer_digits = len(decimal_value.copy_abs().to_integral_value().as_tuple().digits)
                    if integer_digits > DECIMAL_PRECISION - DECIMAL_SCALE:
                        raise ValueError(f"valor excede DECIMAL({DECIMAL_PRECISION},{DECIMAL_SCALE})")
                    return decimal_value

                result[column] = result[column].map(to_fixed_decimal)
            elif selected == "boolean":
                values = result[column].astype("string").str.strip().str.lower()
                mapping = {"true": True, "false": False, "sim": True, "nao": False, "não": False, "1": True, "0": False}
                converted = values.map(mapping)
                if converted[result[column].notna()].isna().any():
                    raise ValueError("valor booleano invalido")
                result[column] = converted.astype("boolean")
            elif selected in {"date", "datetime"}:
                converted = pd.to_datetime(result[column], errors="raise")
                result[column] = converted.dt.normalize() if selected == "date" else converted
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise ValueError(f"A coluna {column} nao pode ser convertida para {selected}: {exc}") from exc
    return result


def list_lakehouse_history(limit: int = 50) -> list[DataLoadHistoryItem]:
    root = storage_root()
    if not root.exists():
        return []

    items = []
    for manifest_path in root.glob("*/*/manifest.json"):
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            items.append(
                DataLoadHistoryItem(
                    load_id=manifest["load_id"],
                    table_name=manifest["table_name"],
                    dataset_kind=manifest["dataset_kind"],
                    source_file=manifest["source_file"],
                    sheet_name=manifest["sheet_name"],
                    row_count=manifest["row_count"],
                    column_count=manifest["column_count"],
                    created_at=manifest["created_at"],
                    output_path=str(manifest_path.parent),
                    frequency=manifest.get("frequency", "once"),
                    reference_column=manifest.get("reference_column"),
                    load_strategy=manifest.get("load_strategy", "replace_all"),
                    requested_by=manifest.get("requested_by", "unknown"),
                )
            )
        except (KeyError, json.JSONDecodeError, OSError):
            continue

    return sorted(items, key=lambda item: item.created_at, reverse=True)[:limit]


def list_registered_tables() -> list[RegisteredTableItem]:
    history = list_lakehouse_history(limit=1000)
    latest_by_table = {}
    for item in history:
        latest_by_table.setdefault(item.table_name, item)

    tables = []
    for table in list_registered_catalog_tables():
        table_name = table["table_name"]
        latest = latest_by_table.get(table_name)
        tables.append(
            RegisteredTableItem(
                id=table_name,
                name=table_name.removeprefix("dim_").removeprefix("fato_").replace("_", " ").title(),
                technical_name=table_name,
                dataset_kind=table["dataset_kind"],
                status="ready" if latest else "review",
                frequency=latest.frequency if latest else ("monthly" if table["dataset_kind"] == "fact" else "once"),
                period_field=(latest.reference_column or "Nao se aplica") if latest else ("mes_ref" if table["dataset_kind"] == "fact" else "Nao se aplica"),
                last_load=latest.created_at if latest else None,
                last_source_file=latest.source_file if latest else None,
                row_count=latest.row_count if latest else 0,
                column_count=len(table["columns"]),
                columns=table["columns"],
            )
        )

    loaded_unknown_tables = set(latest_by_table) - {table["table_name"] for table in list_registered_catalog_tables()}
    for table_name in sorted(loaded_unknown_tables):
        latest = latest_by_table[table_name]
        tables.append(
            RegisteredTableItem(
                id=table_name,
                name=table_name.replace("_", " ").title(),
                technical_name=table_name,
                dataset_kind=latest.dataset_kind,
                status="ready",
                frequency=latest.frequency,
                period_field=latest.reference_column or "Nao se aplica",
                last_load=latest.created_at,
                last_source_file=latest.source_file,
                row_count=latest.row_count,
                column_count=latest.column_count,
                columns=[],
            )
        )

    return sorted(tables, key=lambda table: (table.last_load is None, table.technical_name))
