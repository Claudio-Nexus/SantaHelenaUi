from datetime import datetime

import pandas as pd

from api.services.schema_detector import infer_column_type


def test_infers_supported_column_types() -> None:
    assert infer_column_type(pd.Series([1, 2, None], dtype=object)) == "integer"
    assert infer_column_type(pd.Series([0.1, 2.5, None], dtype=object)) == "decimal"
    assert infer_column_type(pd.Series(["001", "002", None], dtype=object)) == "text"
    assert infer_column_type(pd.Series([True, False, None], dtype=object)) == "boolean"
    assert infer_column_type(pd.Series([datetime(2026, 7, 23), None], dtype=object)) == "datetime"
