from io import StringIO
from io import BytesIO
from decimal import Decimal

import pandas as pd
import pyarrow.parquet as pq

from api.services.lakehouse_writer import (
    coerce_dataframe_types,
    dataframe_to_csv,
    dataframe_to_parquet,
    decimal_without_exponent,
)


def test_decimal_without_exponent_preserves_small_percentage() -> None:
    value = 5.907895902874192e-05
    assert decimal_without_exponent(value) == "0.00005907895902874192"


def test_csv_does_not_use_scientific_notation_for_small_values() -> None:
    output = StringIO()
    dataframe_to_csv(pd.DataFrame({"percentual": [5.907895902874192e-05, 0.06538563790506012]}), output, index=False)
    csv = output.getvalue()
    assert "e-" not in csv.lower()
    assert "0.00005907895902874192" in csv
    assert "0.06538563790506012" in csv


def test_selected_types_are_applied_before_fabric() -> None:
    dataframe = pd.DataFrame({"sku": [2174, 10], "percentual": [5.907895902874192e-05, 0.5]})
    converted = coerce_dataframe_types(dataframe, {"sku": "text", "percentual": "decimal"})
    assert str(converted.dtypes["sku"]) == "string"
    assert converted.iloc[0]["percentual"] == Decimal("0.000059078959028742")
    assert converted.iloc[0]["sku"] == "2174"


def test_parquet_uses_fixed_decimal_instead_of_double() -> None:
    dataframe = pd.DataFrame({"percentual": [5.907895902874192e-05, None]})
    converted = coerce_dataframe_types(dataframe, {"percentual": "decimal"})
    output = BytesIO()
    dataframe_to_parquet(converted, output, {"percentual": "decimal"})
    output.seek(0)
    table = pq.read_table(output)
    assert str(table.schema.field("percentual").type) == "decimal128(38, 18)"
    assert table.column("percentual")[0].as_py() == Decimal("0.000059078959028742")
