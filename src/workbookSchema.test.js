import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDimensionDraftFromSchema } from "./dimensions";
import { extractWorkbookSchemaFromArrayBuffer } from "./workbookSchema";

const samplesPath = join(process.cwd(), "teste-files");

function readSample(fileName) {
  const buffer = readFileSync(join(samplesPath, fileName));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

describe("leitura de schema no navegador", () => {
  it("extrai o schema do cadastro de produtos", async () => {
    const schema = await extractWorkbookSchemaFromArrayBuffer(
      "Cadastro de Produtos.xlsm",
      readSample("Cadastro de Produtos.xlsm"),
    );
    const draft = createDimensionDraftFromSchema(schema.fileName, schema.columns);

    expect(schema).toMatchObject({
      sheetName: "Export",
      headerRow: 1,
      columnCount: 16,
    });
    expect(schema.columns).toContain("sku");
    expect(schema.columns).toContain("desc_marca");
    expect(draft).toMatchObject({
      dimensionName: "dim_produto",
      detectedStatus: "ready",
      datasetKind: "dimension",
    });
  }, 15000);

  it("extrai e reconhece o S&OP de junho como fato", async () => {
    const schema = await extractWorkbookSchemaFromArrayBuffer(
      "Santa Helena_S&OP Consensado_06.2026.xlsx",
      readSample("Santa Helena_S&OP Consensado_06.2026.xlsx"),
    );
    const draft = createDimensionDraftFromSchema(schema.fileName, schema.columns);

    expect(schema).toMatchObject({
      sheetName: "S&OP",
      headerRow: 1,
    });
    expect(schema.columns).toContain("Colaboração M2 Kg");
    expect(draft).toMatchObject({
      dimensionName: "fato_sop_consensado",
      detectedStatus: "ready",
      datasetKind: "fact",
    });
  }, 15000);

  it("extrai e reconhece o S&OP de julho como fato", async () => {
    const schema = await extractWorkbookSchemaFromArrayBuffer(
      "Santa Helena_S&OP Consensado_07.2026.xlsx",
      readSample("Santa Helena_S&OP Consensado_07.2026.xlsx"),
    );
    const draft = createDimensionDraftFromSchema(schema.fileName, schema.columns);

    expect(schema).toMatchObject({
      sheetName: "S&OP",
      headerRow: 1,
    });
    expect(schema.columns).toContain("Colaboração M2 R$");
    expect(draft).toMatchObject({
      dimensionName: "fato_sop_consensado",
      detectedStatus: "ready",
      datasetKind: "fact",
    });
  }, 15000);
});
