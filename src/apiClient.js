const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export async function getCurrentUser() {
  const response = await fetch(`${API_BASE_URL}/api/me`);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.detail || "Nao foi possivel carregar o usuario.");
  }

  return {
    email: data.email,
    name: data.name,
    authProvider: data.auth_provider,
    roles: data.roles || [],
  };
}

export async function requestDataLoadPreview(file, tableName = "") {
  const body = new FormData();
  body.append("file", file);
  if (tableName) body.append("table_name", tableName);

  const response = await fetch(`${API_BASE_URL}/api/data-loads/preview`, {
    method: "POST",
    body,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.detail || "Nao foi possivel ler o arquivo pela API.");
    error.status = response.status;
    throw error;
  }

  return data;
}

export async function inspectRegisteredTable(tableName, columns) {
  const body = new FormData();
  body.append("table_name", tableName);
  body.append("columns", JSON.stringify(columns));
  const response = await fetch(`${API_BASE_URL}/api/tables/inspect`, { method: "POST", body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Nao foi possivel consultar a tabela no Fabric.");
  return data;
}

export async function commitDataLoad(file, settings) {
  const body = new FormData();
  body.append("file", file);
  body.append("frequency", settings.frequency);
  if (settings.referenceColumn) body.append("reference_column", settings.referenceColumn);
  body.append("load_strategy", settings.loadStrategy);
  body.append("table_name", settings.dimensionName);
  body.append(
    "column_types",
    JSON.stringify(Object.fromEntries(settings.detectedColumns.map((column) => [column.column, column.type]))),
  );

  const response = await fetch(`${API_BASE_URL}/api/data-loads/commit`, {
    method: "POST",
    body,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.detail || "Nao foi possivel confirmar a carga.");
  }

  return data;
}

export async function getDataLoadHistory() {
  const response = await fetch(`${API_BASE_URL}/api/data-loads/history`);
  const data = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error(data.detail || "Nao foi possivel carregar o historico.");
  }

  return data;
}

export async function getRegisteredTables() {
  const response = await fetch(`${API_BASE_URL}/api/tables`);
  const data = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error(data.detail || "Nao foi possivel carregar as tabelas.");
  }

  return data.map((table) => ({
    id: table.id,
    name: table.name,
    technicalName: table.technical_name,
    datasetKind: table.dataset_kind,
    status: table.status,
    frequency: table.frequency,
    periodField: table.period_field,
    lastLoad: table.last_load,
    lastSourceFile: table.last_source_file,
    rowCount: table.row_count,
    columnCount: table.column_count,
    columns: table.columns,
  }));
}

export function apiPreviewToDraft(preview) {
  return {
    sourceFileName: preview.file_name,
    sourceSheet: preview.sheet_name,
    sourceRows: preview.row_count,
    sourceColumns: preview.column_count,
    dimensionName: preview.table_name,
    datasetKind: preview.dataset_kind,
    detectedStatus: preview.status,
    statusReason: preview.message,
    detectedColumns: preview.columns.map((column) => ({
      column: column.column,
      type: column.type,
      example: column.example || "-",
      status: column.status,
    })),
  };
}

export async function getBiWorkspaces() {
  const response = await fetch(`${API_BASE_URL}/api/bi/workspaces`);
  const data = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error(data.detail || "Nao foi possivel carregar workspaces.");
  }

  return data.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    userRole: workspace.user_role,
    canPublish: workspace.can_publish,
  }));
}

export async function previewBiPublish(file, workspaceId, reportName) {
  const body = new FormData();
  body.append("file", file);
  body.append("workspace_id", workspaceId);
  if (reportName) body.append("report_name", reportName);

  const response = await fetch(`${API_BASE_URL}/api/bi/preview`, {
    method: "POST",
    body,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.detail || "Nao foi possivel validar a publicacao.");
  }

  return data;
}

export async function commitBiPublish(file, workspaceId, reportName, publishMode) {
  const body = new FormData();
  body.append("file", file);
  body.append("workspace_id", workspaceId);
  if (reportName) body.append("report_name", reportName);
  body.append("publish_mode", publishMode);

  const response = await fetch(`${API_BASE_URL}/api/bi/commit`, {
    method: "POST",
    body,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.detail || "Nao foi possivel publicar o BI.");
  }

  return data;
}

export async function getBiHistory() {
  const response = await fetch(`${API_BASE_URL}/api/bi/history`);
  const data = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error(data.detail || "Nao foi possivel carregar o historico de BI.");
  }

  return data;
}
