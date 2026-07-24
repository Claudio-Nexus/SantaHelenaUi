from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
import re

import pandas as pd


@dataclass
class FilePreview:
    file_name: str
    sheet_name: str
    header_row: int
    row_count: int
    column_count: int
    columns: list[str]
    sample_rows: list[dict]
    dataframe: pd.DataFrame


def read_file_preview(file_name: str, content: bytes) -> FilePreview:
    suffix = Path(file_name).suffix.lower()
    if suffix in {".xlsx", ".xlsm"}:
        return read_excel_preview(file_name, content)
    if suffix == ".csv":
        return read_csv_preview(file_name, content)
    raise ValueError("Formato ainda nao suportado pela API. Use Excel ou CSV.")


def read_excel_preview(file_name: str, content: bytes) -> FilePreview:
    workbook = pd.ExcelFile(BytesIO(content), engine="openpyxl")
    candidates = []

    for sheet_name in workbook.sheet_names:
        raw = pd.read_excel(workbook, sheet_name=sheet_name, header=None, dtype=object)
        raw = raw.dropna(how="all")
        if raw.empty:
            continue

        header_index = find_header_row(raw)
        if header_index is None:
            continue

        header_values = raw.iloc[header_index].tolist()
        data = raw.iloc[header_index + 1 :].dropna(how="all")
        positions, columns = select_named_columns(header_values, data)
        if not columns:
            continue

        data = data.iloc[:, positions]
        candidates.append(
            {
                "sheet_name": sheet_name,
                "header_row": int(header_index) + 1,
                "row_count": int(len(data)),
                "column_count": len(columns),
                "columns": columns,
                "sample_rows": build_sample_rows(data, columns),
                "dataframe": normalize_dataframe(data, columns),
                "score": int(len(data)) * max(1, len(columns)),
            }
        )

    if not candidates:
        raise ValueError("Nao encontramos cabecalho em nenhuma aba do arquivo.")

    selected = sorted(candidates, key=lambda item: item["score"], reverse=True)[0]
    return FilePreview(file_name=file_name, **{key: value for key, value in selected.items() if key != "score"})


def read_csv_preview(file_name: str, content: bytes) -> FilePreview:
    df = pd.read_csv(BytesIO(content), dtype=object, sep=None, engine="python")
    positions, columns = select_named_columns(df.columns.tolist(), df)
    df = df.iloc[:, positions]
    return FilePreview(
        file_name=file_name,
        sheet_name="CSV",
        header_row=1,
        row_count=int(len(df)),
        column_count=len(columns),
        columns=columns,
        sample_rows=build_sample_rows(df, columns),
        dataframe=normalize_dataframe(df, columns),
    )


def find_header_row(df: pd.DataFrame) -> int | None:
    best_index = None
    best_score = 0
    scan = df.head(30)

    for index, row in scan.iterrows():
        values = [value for value in row.tolist() if pd.notna(value) and str(value).strip()]
        text_count = sum(any(char.isalpha() for char in str(value)) for value in values)
        if len(values) < 2 or text_count < 2:
            continue
        score = len(values) + text_count * 2
        if score > best_score:
            best_score = score
            best_index = int(index)

    return best_index


def clean_columns(values: list[object]) -> list[str]:
    columns = []
    for value in values:
        if pd.isna(value):
            continue
        column = str(value).strip()
        if column:
            columns.append(column)
    return columns


def select_named_columns(header_values: list[object], data: pd.DataFrame) -> tuple[list[int], list[str]]:
    positions = []
    columns = []
    for index, value in enumerate(header_values):
        name = "" if pd.isna(value) else str(value).strip()
        unnamed = not name or bool(re.fullmatch(r"Unnamed:\s*\d+", name, flags=re.IGNORECASE))
        if unnamed:
            has_data = index < data.shape[1] and data.iloc[:, index].notna().any()
            if has_data:
                raise ValueError(
                    f"A coluna {index + 1} nao possui nome, mas contem dados. Informe um cabecalho antes de carregar."
                )
            continue
        positions.append(index)
        columns.append(name)
    return positions, columns


def build_sample_rows(df: pd.DataFrame, columns: list[str]) -> list[dict]:
    if df.empty:
        return []

    sample = df.head(5).copy()
    sample = sample.iloc[:, : len(columns)]
    sample.columns = columns[: len(sample.columns)]
    sample = sample.where(pd.notna(sample), None)
    return sample.to_dict(orient="records")


def normalize_dataframe(df: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    normalized = df.iloc[:, : len(columns)].copy()
    normalized.columns = columns[: len(normalized.columns)]
    return normalized.dropna(how="all").reset_index(drop=True)
