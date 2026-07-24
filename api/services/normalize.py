import re
import unicodedata


def normalize_column_name(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    text = re.sub(r"r\$", "r", text, flags=re.IGNORECASE)
    text = re.sub(r"[^a-zA-Z0-9]+", "_", text)
    return text.strip("_").lower()


def normalize_columns(columns: list[object]) -> list[str]:
    return [normalize_column_name(column) for column in columns if column not in (None, "")]


def technical_name_from_file(file_name: str) -> str:
    base_name = re.sub(r"\.[^.]+$", "", file_name)
    normalized = normalize_column_name(base_name)
    return normalized if normalized else "tabela_nova"


def friendly_name(technical_name: str) -> str:
    return technical_name.removeprefix("dim_").removeprefix("fato_").replace("_", " ")
