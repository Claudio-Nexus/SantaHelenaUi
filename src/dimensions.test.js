import { describe, expect, it } from "vitest";
import {
  analyzeDimensionLoad,
  createDimensionDraftFromFile,
  createDimensionDraftFromSchema,
  detectDimensionName,
  dimensionSchemas,
  frequencyLabel,
  inferDatasetKindFromColumns,
  registeredTables,
  sourceSummary,
} from "./dimensions";

const productWorkbookColumns = [
  "sku",
  "descricao",
  "cod_descricao",
  "desc_categoria",
  "desc_marca",
  "desc_segmento",
  "Unidade de faturamento",
  "Ativo",
  "Classificação",
  "PDV Nota 10",
  "Fase de Vida",
  "Inovação",
  "Mercado",
  "De - Para",
  "Peso",
  "Preço Médio (CX)",
];

const sopWorkbookColumns = [
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

describe("carga de dados", () => {
  it("normaliza o nome da dimensao a partir do arquivo", () => {
    expect(detectDimensionName("Calendario Mensal.delta")).toBe("dim_calendario_mensal");
    expect(detectDimensionName("dim_produto.parquet")).toBe("dim_produto");
  });

  it("libera a carga quando a tabela ja existe e as colunas conferem", () => {
    const result = analyzeDimensionLoad({
      dimensionName: "dim_calendario",
      columns: dimensionSchemas.dim_calendario.map((field) => field.column),
    });

    expect(result.status).toBe("ready");
  });

  it("marca como tabela nova quando nao existe modelo salvo", () => {
    const result = analyzeDimensionLoad({
      dimensionName: "dim_canal_venda",
      columns: ["codigo", "descricao"],
    });

    expect(result.status).toBe("new");
  });

  it("bloqueia quando o mesmo nome chega com schema diferente", () => {
    const result = analyzeDimensionLoad({
      dimensionName: "dim_calendario",
      columns: ["cod_calendario", "data", "coluna_nao_prevista"],
    });

    expect(result.status).toBe("blocked");
  });

  it("reconhece o cadastro de produtos real como dimensao de produto", () => {
    const draft = createDimensionDraftFromSchema("Cadastro de Produtos.xlsm", productWorkbookColumns);

    expect(draft).toMatchObject({
      dimensionName: "dim_produto",
      datasetKind: "dimension",
      detectedStatus: "ready",
    });
  });

  it("reconhece os arquivos S&OP como fato mensal", () => {
    const juneDraft = createDimensionDraftFromSchema("Santa Helena_S&OP Consensado_06.2026.xlsx", sopWorkbookColumns);
    const julyDraft = createDimensionDraftFromSchema("Santa Helena_S&OP Consensado_07.2026.xlsx", sopWorkbookColumns);

    expect(inferDatasetKindFromColumns(sopWorkbookColumns)).toBe("fact");
    expect(juneDraft).toMatchObject({
      dimensionName: "fato_sop_consensado",
      datasetKind: "fact",
      detectedStatus: "ready",
    });
    expect(julyDraft).toMatchObject({
      dimensionName: "fato_sop_consensado",
      datasetKind: "fact",
      detectedStatus: "ready",
    });
  });

  it("monta o rascunho do arquivo usando a regra de schema", () => {
    const readyDraft = createDimensionDraftFromFile("dim_produto.delta", registeredTables);
    const newDraft = createDimensionDraftFromFile("dim_produto_divergente.delta", registeredTables);

    expect(readyDraft).toMatchObject({
      sourceFileName: "dim_produto.delta",
      dimensionName: "dim_produto",
      detectedStatus: "ready",
    });
    expect(newDraft.detectedStatus).toBe("new");
  });

  it("trata campos auxiliares usados no resumo da carga", () => {
    expect(frequencyLabel("monthly")).toBe("Mensal");
    expect(sourceSummary({ sourceMode: "upload", sourceFileName: "" })).toBe("Arquivo local pendente");
    expect(sourceSummary({ sourceMode: "lakehouse", sourcePath: "lakehouse://gold/dim_produto" })).toBe(
      "lakehouse://gold/dim_produto",
    );
  });
});
