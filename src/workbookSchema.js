export async function extractSchemaFromFile(file) {
  const extension = getExtension(file.name);

  if (["xlsx", "xlsm"].includes(extension)) {
    const buffer = await file.arrayBuffer();
    return extractWorkbookSchemaFromArrayBuffer(file.name, buffer);
  }

  if (extension === "csv") {
    const text = await file.text();
    return extractCsvSchema(file.name, text);
  }

  throw new Error("Formato ainda sem leitura local. Use Excel ou CSV para validar o schema no navegador.");
}

export async function extractWorkbookSchemaFromArrayBuffer(fileName, buffer) {
  const ExcelJSModule = await import("exceljs");
  const ExcelJS = ExcelJSModule.default || ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const candidates = workbook.worksheets
    .map((sheet) => {
      const rows = [];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        rows.push(row.values.slice(1).map(formatCellValue));
      });
      return buildSheetCandidate(sheet.name, rows, sheet.actualRowCount, sheet.actualColumnCount);
    })
    .filter((candidate) => candidate.columns.length > 0);

  if (!candidates.length) {
    throw new Error("Nao encontramos cabecalho em nenhuma aba do arquivo.");
  }

  const selected = candidates.sort((left, right) => right.score - left.score)[0];

  return {
    fileName,
    sheetName: selected.sheetName,
    headerRow: selected.headerRow,
    columns: selected.columns,
    rowCount: selected.rowCount,
    columnCount: selected.columnCount,
  };
}

export function extractCsvSchema(fileName, text) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim());
  if (!firstLine) {
    throw new Error("O CSV esta vazio.");
  }

  const delimiter = firstLine.includes(";") ? ";" : ",";
  const columns = firstLine
    .split(delimiter)
    .map((column) => column.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);

  if (!columns.length) {
    throw new Error("Nao encontramos colunas no CSV.");
  }

  return {
    fileName,
    sheetName: "CSV",
    headerRow: 1,
    columns,
    rowCount: text.split(/\r?\n/).filter((line) => line.trim()).length,
    columnCount: columns.length,
  };
}

function buildSheetCandidate(sheetName, rows, actualRowCount = null, actualColumnCount = null) {
  const normalizedRows = rows.map((row) => row.map((cell) => (cell == null ? "" : String(cell).trim())));
  const header = findHeaderRow(normalizedRows);
  const rowCount = actualRowCount || normalizedRows.filter((row) => row.some(Boolean)).length;
  const columnCount = actualColumnCount || normalizedRows.reduce((max, row) => Math.max(max, row.length), 0);

  if (!header) {
    return {
      sheetName,
      headerRow: null,
      columns: [],
      rowCount,
      columnCount,
      score: 0,
    };
  }

  const columns = header.values.filter(Boolean);
  const score = rowCount * Math.max(1, columns.length);

  return {
    sheetName,
    headerRow: header.index + 1,
    columns,
    rowCount,
    columnCount,
    score,
  };
}

function findHeaderRow(rows) {
  return rows.slice(0, 30).reduce((best, row, index) => {
    const values = row.filter(Boolean);
    const textCount = values.filter((value) => /[a-zA-ZÀ-ÿ]/.test(value)).length;
    const score = values.length + textCount * 2;
    if (values.length < 2 || textCount < 2) return best;
    if (!best || score > best.score) return { index, values: row, score };
    return best;
  }, null);
}

function getExtension(fileName) {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

function formatCellValue(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value) return value.text;
    if ("result" in value) return value.result;
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
  }
  return String(value);
}
