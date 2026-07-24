from io import BytesIO

import pandas as pd
import pytest

from api.services.file_reader import read_csv_preview, select_named_columns


def test_ignores_unnamed_column_only_when_empty() -> None:
    preview = read_csv_preview("dados.csv", b"sku,Unnamed: 1\n00023,\n00024,\n")
    assert preview.columns == ["sku"]
    assert preview.column_count == 1


def test_blocks_unnamed_column_that_contains_data() -> None:
    data = pd.DataFrame([["00023", "valor"]])
    with pytest.raises(ValueError, match="nao possui nome, mas contem dados"):
        select_named_columns(["sku", "Unnamed: 1"], data)
