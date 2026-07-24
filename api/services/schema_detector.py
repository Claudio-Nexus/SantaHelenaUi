from datetime import date, datetime
from numbers import Integral, Real

import pandas as pd

from api.schemas import ColumnPreview, DataLoadPreview
from api.services.catalog_service import get_registered_table
from api.services.file_reader import FilePreview
from api.services.normalize import friendly_name, normalize_columns, technical_name_from_file


def build_preview(file_preview: FilePreview) -> DataLoadPreview:
    table_name = resolve_table_name(file_preview.columns) or technical_name_from_file(file_preview.file_name)
    dataset_kind = infer_dataset_kind(file_preview.columns)
    registered = get_registered_table(table_name)

    if registered is None:
        status = "new"
        message = (
            "Identificamos uma tabela fato nova. Ao confirmar, o sistema cria a tabela no Lakehouse com as colunas encontradas."
            if dataset_kind == "fact"
            else "Nao encontramos tabela salva com esse schema. Ao confirmar, o sistema cria uma nova tabela."
        )
    elif same_columns(registered["columns"], file_preview.columns):
        status = "ready"
        message = "Encontramos uma tabela cadastrada com as mesmas colunas. A carga pode seguir."
    else:
        status = "blocked"
        message = "Ja existe uma tabela com esse nome, mas as colunas enviadas estao diferentes."

    return DataLoadPreview(
        file_name=file_preview.file_name,
        table_name=table_name,
        friendly_name=friendly_name(table_name),
        dataset_kind=dataset_kind,
        status=status,
        message=message,
        sheet_name=file_preview.sheet_name,
        header_row=file_preview.header_row,
        row_count=file_preview.row_count,
        column_count=file_preview.column_count,
        columns=build_column_preview(file_preview),
    )


def infer_dataset_kind(columns: list[str]) -> str:
    normalized = normalize_columns(columns)
    has_measures = any(
        column in {"colaboracao_m02", "colaboracao_m2_kg", "colaboracao_m2_r", "soma_de_colaboracao_m2_kg"}
        for column in normalized
    )
    has_fact_grain = "sku" in normalized and ("locid" in normalized or "canal" in normalized)
    return "fact" if has_measures or has_fact_grain else "dimension"


def resolve_table_name(columns: list[str]) -> str | None:
    normalized = normalize_columns(columns)
    sop_fields = {"gerente_nacional", "gerente_regional", "canal", "locid", "sku", "colaboracao_m2_kg"}
    if sop_fields.issubset(set(normalized)):
        return "fato_sop_consensado"

    product_fields = {"sku", "descricao", "desc_categoria", "desc_marca", "desc_segmento"}
    if product_fields.issubset(set(normalized)):
        return "dim_produto"

    return None


def same_columns(left: list[str], right: list[str]) -> bool:
    return normalize_columns(left) == normalize_columns(right)


def build_column_preview(file_preview: FilePreview) -> list[ColumnPreview]:
    preview = []
    first_row = file_preview.sample_rows[0] if file_preview.sample_rows else {}

    for column in file_preview.columns:
        preview.append(
            ColumnPreview(
                column=column,
                type=infer_column_type(file_preview.dataframe[column]),
                example=None if first_row.get(column) is None else str(first_row.get(column)),
                status="OK",
            )
        )

    return preview


def infer_column_type(series: pd.Series) -> str:
    values = [value for value in series.tolist() if value is not None and not pd.isna(value)]
    if not values:
        return "text"
    if all(isinstance(value, bool) for value in values):
        return "boolean"
    if all(isinstance(value, (datetime, pd.Timestamp)) for value in values):
        return "datetime"
    if all(isinstance(value, date) for value in values):
        return "date"
    if all(isinstance(value, Integral) and not isinstance(value, bool) for value in values):
        return "integer"
    if all(isinstance(value, Real) and not isinstance(value, bool) for value in values):
        return "integer" if all(float(value).is_integer() for value in values) else "decimal"
    return "text"
