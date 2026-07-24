DIMENSION_SCHEMAS = {
    "dim_calendario": ["mes_ref", "cod_calendario", "data", "dia_util"],
    "dim_produto": [
        "sku",
        "descricao",
        "cod_descricao",
        "desc_categoria",
        "desc_marca",
        "desc_segmento",
        "Unidade de faturamento",
        "Ativo",
        "Classificacao",
        "PDV Nota 10",
        "Fase de Vida",
        "Inovacao",
        "Mercado",
        "De - Para",
        "Peso",
        "Preco Medio (CX)",
    ],
    "dim_cliente": ["data_ref", "cod_cliente", "nome_cliente", "uf"],
}

FACT_SCHEMAS = {
    "fato_sop_consensado": [
        "Gerente Nacional",
        "Gerente Regional",
        "Canal",
        "LOCID",
        "SKU",
        "Descricao",
        "Marca",
        "Segmento",
        "Classificacao",
        "Mercado (Interno/Externo)",
        "Colaboracao M02",
        "Colaboracao M2 Kg",
        "Colaboracao M2 R$",
    ],
}

REGISTERED_TABLES = {
    "dim_calendario": {
        "table_name": "dim_calendario",
        "dataset_kind": "dimension",
        "columns": DIMENSION_SCHEMAS["dim_calendario"],
    },
    "dim_produto": {
        "table_name": "dim_produto",
        "dataset_kind": "dimension",
        "columns": DIMENSION_SCHEMAS["dim_produto"],
    },
    "dim_cliente": {
        "table_name": "dim_cliente",
        "dataset_kind": "dimension",
        "columns": DIMENSION_SCHEMAS["dim_cliente"],
    },
    "fato_sop_consensado": {
        "table_name": "fato_sop_consensado",
        "dataset_kind": "fact",
        "columns": FACT_SCHEMAS["fato_sop_consensado"],
    },
}


def get_registered_table(table_name: str) -> dict | None:
    return REGISTERED_TABLES.get(table_name)


def list_registered_catalog_tables() -> list[dict]:
    return list(REGISTERED_TABLES.values())
