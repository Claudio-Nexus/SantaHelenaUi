export const dimensionSchemas = {
  dim_calendario: [
    { column: "mes_ref", type: "texto", example: "2026-07", status: "Campo do periodo" },
    { column: "cod_calendario", type: "texto", example: "20260701", status: "OK" },
    { column: "data", type: "data", example: "2026-07-01", status: "OK" },
    { column: "dia_util", type: "sim/nao", example: "true", status: "OK" },
  ],
  dim_produto: [
    { column: "sku", type: "texto", example: "100245", status: "OK" },
    { column: "descricao", type: "texto", example: "Pacoca rolha", status: "OK" },
    { column: "cod_descricao", type: "texto", example: "100245 - Pacoca rolha", status: "OK" },
    { column: "desc_categoria", type: "texto", example: "Tradicional", status: "OK" },
    { column: "desc_marca", type: "texto", example: "Santa Helena", status: "OK" },
    { column: "desc_segmento", type: "texto", example: "Doces", status: "OK" },
    { column: "unidade_de_faturamento", type: "texto", example: "Caixas", status: "OK" },
    { column: "ativo", type: "sim/nao", example: "Sim", status: "OK" },
    { column: "classificacao", type: "texto", example: "AA", status: "OK" },
    { column: "pdv_nota_10", type: "numero", example: "0", status: "OK" },
    { column: "fase_de_vida", type: "texto", example: "Interno", status: "OK" },
    { column: "inovacao", type: "numero", example: "10", status: "OK" },
    { column: "mercado", type: "texto", example: "Interno", status: "OK" },
    { column: "de_para", type: "texto", example: "SKU base", status: "OK" },
    { column: "peso", type: "numero", example: "15", status: "OK" },
    { column: "preco_medio_cx", type: "numero", example: "42.90", status: "OK" },
  ],
  dim_cliente: [
    { column: "data_ref", type: "data", example: "2026-07-09", status: "Campo do periodo" },
    { column: "cod_cliente", type: "texto", example: "CLI001", status: "OK" },
    { column: "nome_cliente", type: "texto", example: "Mercado Central", status: "OK" },
    { column: "uf", type: "texto", example: "SP", status: "OK" },
  ],
};

const sopColumns = [
  "Gerente Nacional",
  "Gerente Regional",
  "Canal",
  "LOCID",
  "SKU",
  "Descrição",
  "Marca",
  "Segmento",
  "Classificação",
  "Mercado (Interno/Externo)",
  "Colaboração M02",
  "Colaboração M2 Kg",
  "Colaboração M2 R$",
];

export const registeredTables = [
  {
    id: "dim_calendario",
    name: "Calendario",
    technicalName: "dim_calendario",
    status: "ready",
    frequency: "Mensal",
    periodField: "mes_ref",
    lastLoad: "08/07/2026 13:42",
    lastUser: "marina.souza@santahelena.com",
    saveMode: "Trocar apenas o periodo enviado",
    structureKey: "cal-7f31",
    columns: dimensionSchemas.dim_calendario.map((field) => field.column),
  },
  {
    id: "dim_produto",
    name: "Produto",
    technicalName: "dim_produto",
    status: "ready",
    frequency: "Unica",
    periodField: "Nao se aplica",
    lastLoad: "07/07/2026 16:10",
    lastUser: "bi.ops@santahelena.com",
    saveMode: "Trocar a tabela inteira",
    structureKey: "prd-2a90",
    columns: dimensionSchemas.dim_produto.map((field) => field.column),
  },
  {
    id: "dim_cliente",
    name: "Cliente",
    technicalName: "dim_cliente",
    status: "review",
    frequency: "Diaria",
    periodField: "data_ref",
    lastLoad: "06/07/2026 09:21",
    lastUser: "andre.lima@santahelena.com",
    saveMode: "Atualizar registros existentes",
    structureKey: "cli-4c12",
    columns: dimensionSchemas.dim_cliente.map((field) => field.column),
  },
  {
    id: "fato_sop_consensado",
    name: "S&OP Consensado",
    technicalName: "fato_sop_consensado",
    status: "ready",
    frequency: "Mensal",
    periodField: "mes_ref",
    lastLoad: "09/07/2026 14:25",
    lastUser: "planejamento@santahelena.com",
    saveMode: "Trocar apenas o periodo enviado",
    structureKey: "sop-8d21",
    datasetKind: "fact",
    columns: sopColumns,
  },
];

export function createDimensionDraftFromFile(fileName, registry = registeredTables) {
  const detectedName = detectDimensionName(fileName);
  const rows = inferSchemaRows(detectedName, fileName);
  const dimensionName = resolveTableNameFromColumns(rows.map((row) => row.column)) || detectedName;
  const result = analyzeDimensionLoad({ dimensionName, columns: rows.map((row) => row.column) }, registry);

  return {
    sourceFileName: fileName,
    dimensionName,
    datasetKind: result.datasetKind,
    detectedStatus: result.status,
    statusReason: result.reason,
    detectedColumns: rows,
  };
}

export function createDimensionDraftFromSchema(fileName, columns, registry = registeredTables) {
  const normalizedRows = columns.filter(Boolean).map((column) => ({
    column,
    type: "a confirmar",
    example: "-",
    status: "OK",
  }));
  const detectedName = detectDimensionName(fileName);
  const dimensionName = resolveTableNameFromColumns(columns) || detectedName;
  const result = analyzeDimensionLoad({ dimensionName, columns }, registry);

  return {
    sourceFileName: fileName,
    dimensionName,
    datasetKind: result.datasetKind,
    detectedStatus: result.status,
    statusReason: result.reason,
    detectedColumns: normalizedRows,
  };
}

export function analyzeDimensionLoad(load, registry = registeredTables) {
  const datasetKind = inferDatasetKindFromColumns(load.columns);
  const savedTable = registry.find((table) => table.technicalName === load.dimensionName);
  if (!savedTable) {
    return {
      status: "new",
      datasetKind,
      reason:
        datasetKind === "fact"
          ? "Identificamos uma tabela fato nova. Ao confirmar, o sistema cria a tabela no Lakehouse com as colunas encontradas."
          : "Nao encontramos modelo salvo para essa tabela. Ao confirmar, o sistema cria o primeiro modelo.",
    };
  }

  if (sameColumns(savedTable.columns, load.columns)) {
    return {
      status: "ready",
      datasetKind,
      reason:
        datasetKind === "fact"
          ? "Encontramos uma tabela fato cadastrada com as mesmas colunas. A carga pode seguir."
          : "As colunas conferem com o modelo salvo.",
    };
  }

  return {
    status: "blocked",
    datasetKind,
    reason: "Ja existe uma tabela com esse nome, mas as colunas enviadas estao diferentes.",
  };
}

export function inferSchemaRows(dimensionName, fileName = "") {
  const baseRows = dimensionSchemas[dimensionName] || [
    { column: "codigo", type: "texto", example: "001", status: "OK" },
    { column: "descricao", type: "texto", example: "Descricao", status: "OK" },
  ];

  if (hasSchemaMismatchMarker(fileName)) {
    return baseRows
      .filter((row) => row.column !== baseRows[0].column)
      .concat({ column: "coluna_nao_prevista", type: "texto", example: "valor", status: "Diferente" });
  }

  return baseRows;
}

export function inferDatasetKindFromColumns(columns) {
  const normalized = normalizeColumns(columns);
  const hasMeasures = normalized.some((column) =>
    ["colaboracao_m02", "colaboracao_m2_kg", "colaboracao_m2_r", "soma_de_colaboracao_m2_kg"].includes(column),
  );
  const hasFactGrain = normalized.includes("sku") && (normalized.includes("locid") || normalized.includes("canal"));
  if (hasMeasures || hasFactGrain) return "fact";
  return "dimension";
}

export function resolveDimensionNameFromColumns(columns) {
  return resolveTableNameFromColumns(columns);
}

export function resolveTableNameFromColumns(columns) {
  const normalized = normalizeColumns(columns);
  const sopFields = ["gerente_nacional", "gerente_regional", "canal", "locid", "sku", "colaboracao_m2_kg"];
  if (sopFields.every((field) => normalized.includes(field))) return "fato_sop_consensado";

  const productFields = ["sku", "descricao", "desc_categoria", "desc_marca", "desc_segmento"];
  if (productFields.every((field) => normalized.includes(field))) return "dim_produto";
  return null;
}

export function detectDimensionName(fileName) {
  const baseName = fileName
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  if (!baseName) return "dim_nova";
  return baseName.startsWith("dim_") ? baseName : `dim_${baseName}`;
}

export function friendlyDimensionName(value) {
  if (!value) return "Aguardando arquivo";
  return value.replace(/^dim_/, "").replace(/_/g, " ");
}

export function detectedStatusLabel(value) {
  const labels = {
    pending: "Aguardando arquivo",
    ready: "Pronta para carga",
    new: "Tabela nova",
    blocked: "Carga bloqueada",
  };
  return labels[value] || value;
}

export function detectedResultTitle(value) {
  const labels = {
    pending: "Aguardando arquivo",
    ready: "Tabela ja cadastrada",
    new: "Nova tabela encontrada",
    blocked: "Estrutura diferente",
  };
  return labels[value] || value;
}

export function detectedResultText(value, reason = "") {
  if (reason) return reason;
  const labels = {
    pending: "Envie um arquivo para identificar tabela, tipo e colunas.",
    ready: "Encontramos um modelo salvo com o mesmo nome e as mesmas colunas. A carga pode seguir para conferencia.",
    new: "Nao encontramos um modelo salvo para essa tabela. Ao confirmar, o sistema cria o primeiro modelo.",
    blocked: "Ja existe uma tabela com esse nome, mas as colunas enviadas estao diferentes. Para proteger os dados, a carga fica bloqueada.",
  };
  return labels[value] || value;
}

export function schemaStatusDetail(value) {
  const labels = {
    pending: "Aguardando leitura do arquivo",
    ready: "As colunas conferem com o modelo salvo",
    new: "Aguardando confirmacao para criar o modelo",
    blocked: "As colunas nao conferem com o modelo salvo",
  };
  return labels[value] || value;
}

export function frequencyLabel(value) {
  const labels = {
    once: "Unica",
    daily: "Diaria",
    monthly: "Mensal",
  };
  return labels[value] || value;
}

export function strategyLabel(value) {
  const labels = {
    replace_period: "Trocar apenas o periodo enviado",
    replace_all: "Trocar a tabela inteira",
    merge_key: "Atualizar registros existentes",
  };
  return labels[value] || value;
}

export function sourceModeLabel(value) {
  const labels = {
    upload: "Arquivo enviado",
    lakehouse: "Lakehouse",
    external: "Caminho externo",
  };
  return labels[value] || value;
}

export function sourceSummary(form) {
  if (form.sourceMode === "upload") return form.sourceFileName || "Arquivo local pendente";
  return form.sourcePath || "-";
}

function sameColumns(left, right) {
  const normalizedLeft = normalizeColumns(left);
  const normalizedRight = normalizeColumns(right);
  if (normalizedLeft.length !== normalizedRight.length) return false;
  return normalizedLeft.every((column, index) => column === normalizedRight[index]);
}

function hasSchemaMismatchMarker(fileName) {
  const normalized = fileName.toLowerCase();
  return normalized.includes("erro") || normalized.includes("divergente");
}

function normalizeColumns(columns) {
  return columns.filter(Boolean).map(normalizeColumnName);
}

function normalizeColumnName(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/r\$/gi, "r")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}
