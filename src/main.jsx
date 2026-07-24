import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  FileArchive,
  FileUp,
  Home,
  History,
  ListChecks,
  Lock,
  Table2,
} from "lucide-react";
import "./styles.css";
import santaHelenaLogo from "./assets/santa-helena-logo.png";
import {
  createDimensionDraftFromSchema,
  detectedResultText,
  detectedResultTitle,
  detectedStatusLabel,
  frequencyLabel,
  friendlyDimensionName,
  schemaStatusDetail,
  sourceModeLabel,
  sourceSummary,
  strategyLabel,
} from "./dimensions";
import {
  apiPreviewToDraft,
  commitBiPublish,
  commitDataLoad,
  getCurrentUser,
  getBiHistory,
  getBiWorkspaces,
  getDataLoadHistory,
  getRegisteredTables,
  inspectRegisteredTable,
  previewBiPublish,
  requestDataLoadPreview,
} from "./apiClient";
import { extractSchemaFromFile } from "./workbookSchema";

function App() {
  const [activeModule, setActiveModule] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const modules = [
    {
      id: "dimensions",
      icon: Table2,
      title: "Carga de dados",
      description: "Carga manual de fatos e dimensoes com conferencia de colunas.",
    },
    {
      id: "bi",
      icon: BarChart3,
      title: "Publicacao de BI",
      description: "Publicacao de PBIX com validacao de workspace e autorizacao.",
    },
  ];

  useEffect(() => {
    getCurrentUser()
      .then(setCurrentUser)
      .catch(() =>
        setCurrentUser({
          name: "Usuario",
          email: "Sessao local",
          authProvider: "indisponivel",
          roles: [],
        }),
      );
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src={santaHelenaLogo} alt="Santa Helena" />
          <div>
            <strong>Santa Helena</strong>
            <span>Portal de dados</span>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="environment-chip">Ambiente interno</span>
          <span className="user-chip">
            <strong>{currentUser?.name || "Carregando usuario"}</strong>
            <small>{currentUser?.email || "SSO"}</small>
          </span>
          <button className="icon-button" type="button" aria-label="Historico">
            <History size={18} />
          </button>
        </div>
      </header>

      <section className={activeModule ? "page page-with-sidebar" : "page"}>
        {!activeModule ? (
          <HomePage modules={modules} onOpenModule={setActiveModule} />
        ) : (
          <section className="portal-layout">
            <aside className="left-sidebar">
              <button className="sidebar-home" type="button" onClick={() => setActiveModule(null)}>
                <Home size={18} />
                Inicio
              </button>
              <nav aria-label="Modulos">
                {modules.map((module) => {
                  const Icon = module.icon;
                  return (
                    <button
                      key={module.id}
                      className={activeModule === module.id ? "active" : ""}
                      type="button"
                      onClick={() => setActiveModule(module.id)}
                    >
                      <Icon size={18} />
                      {module.title}
                    </button>
                  );
                })}
              </nav>
            </aside>

            <section className="module-content">
              {activeModule === "dimensions" ? <DimensionModule /> : <BiModule />}
            </section>
          </section>
        )}
      </section>
    </main>
  );
}

function HomePage({ modules, onOpenModule }) {
  return (
    <>
      <section className="site-hero">
        <img className="company-logo" src={santaHelenaLogo} alt="Santa Helena" />
        <p>Portal interno</p>
        <h1>Modulos de dados e relatorios</h1>
      </section>

      <section className="home-modules" aria-label="Modulos disponiveis">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <button className="home-module-card" type="button" key={module.id} onClick={() => onOpenModule(module.id)}>
              <span>
                <Icon size={24} />
              </span>
              <strong>{module.title}</strong>
              <small>{module.description}</small>
              <em>Acessar modulo</em>
            </button>
          );
        })}
      </section>
    </>
  );
}

function DimensionModule() {
  const [activeSection, setActiveSection] = useState("new-load");
  const [selectedTableId, setSelectedTableId] = useState("");
  const [wizardStep, setWizardStep] = useState(0);
  const [loadHistory, setLoadHistory] = useState([]);
  const [historyError, setHistoryError] = useState("");
  const [tables, setTables] = useState([]);
  const [tablesError, setTablesError] = useState("");
  const [loadForm, setLoadForm] = useState({
    sourceMode: "upload",
    sourceFileName: "",
    sourceSheet: "",
    sourceRows: 0,
    sourceColumns: 0,
    sourceError: "",
    sourceNotice: "",
    isReadingSource: false,
    isCheckingTable: false,
    selectedFile: null,
    isCommitting: false,
    commitResult: null,
    commitError: "",
    datasetKind: "",
    statusReason: "",
    sourcePath: "",
    detectedStatus: "pending",
    dimensionName: "",
    detectedColumns: [],
    frequency: "",
    referenceColumn: "",
    loadStrategy: "",
  });
  const sections = [
    {
      id: "new-load",
      icon: ListChecks,
      title: "Nova carga",
      description: "Fluxo guiado para carregar dados com verificacao antes de salvar.",
    },
    {
      id: "tables",
      icon: Table2,
      title: "Tabelas cadastradas",
      description: "Modelos e tabelas ja configuradas no Lakehouse.",
    },
    {
      id: "history",
      icon: History,
      title: "Historico",
      description: "Cargas confirmadas e registradas no Lakehouse.",
    },
  ];
  const wizardSteps = ["Enviar dados", "Conferir tabela", "Frequencia", "Conferir colunas", "Confirmar"];
  const selectedTable = tables.find((table) => table.id === selectedTableId) || tables[0] || null;

  async function refreshTables() {
    try {
      const items = await getRegisteredTables();
      setTables(items);
      setTablesError("");
      if (!items.some((table) => table.id === selectedTableId) && items[0]) {
        setSelectedTableId(items[0].id);
      }
    } catch (error) {
      setTablesError(error.message);
    }
  }

  async function refreshLoadHistory() {
    try {
      const history = await getDataLoadHistory();
      setLoadHistory(history);
      setHistoryError("");
    } catch (error) {
      setHistoryError(error.message);
    }
  }

  useEffect(() => {
    refreshLoadHistory();
    refreshTables();
  }, []);

  return (
    <section className="dimension-module">
      <div className="module-heading">
        <p className="section-label">Modulo</p>
        <h1>Carga de dados</h1>
        <p>
          Cargas manuais de fatos e dimensoes, com verificacao de colunas e destino Lakehouse.
        </p>
      </div>

      <nav className="module-section-cards" aria-label="Areas do modulo">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              className={activeSection === section.id ? "active" : ""}
              type="button"
              onClick={() => setActiveSection(section.id)}
            >
              <span>
                <Icon size={20} />
              </span>
              <strong>{section.title}</strong>
              <small>{section.description}</small>
            </button>
          );
        })}
      </nav>

      {activeSection === "new-load" ? (
        <NewLoadWizard
          form={loadForm}
          setForm={setLoadForm}
          step={wizardStep}
          setStep={setWizardStep}
          steps={wizardSteps}
          onCommitted={() => {
            refreshLoadHistory();
            refreshTables();
          }}
        />
      ) : activeSection === "tables" ? (
        <RegisteredTables
          tables={tables}
          selectedTable={selectedTable}
          onSelectTable={setSelectedTableId}
          error={tablesError}
          onRefresh={refreshTables}
        />
      ) : activeSection === "history" ? (
        <DataLoadHistory items={loadHistory} error={historyError} onRefresh={refreshLoadHistory} />
      ) : null}
    </section>
  );
}

function RegisteredTables({ tables, selectedTable, onSelectTable, error, onRefresh }) {
  return (
    <section className="registered-tables">
      <div className="module-section-heading history-heading-row">
        <div>
          <p className="section-label">Tabelas cadastradas</p>
          <h2>Tabelas do Lakehouse</h2>
          <p>Consulte as tabelas conhecidas e as ultimas cargas gravadas pela API.</p>
        </div>
        <button type="button" onClick={onRefresh}>
          Atualizar
        </button>
      </div>

      {error ? (
        <div className="system-result blocked">
          <strong>Nao foi possivel carregar</strong>
          <span>{error}</span>
        </div>
      ) : null}

      <div className="tables-layout">
        <div className="tables-list" aria-label="Tabelas cadastradas">
          {tables.length ? (
            tables.map((table) => (
              <button
                key={table.id}
                className={selectedTable?.id === table.id ? "active" : ""}
                type="button"
                onClick={() => onSelectTable(table.id)}
              >
                <div>
                  <strong>{table.name}</strong>
                  <span>{table.technicalName}</span>
                </div>
                <StatusBadge status={table.status} />
              </button>
            ))
          ) : (
            <div className="system-result">
              <strong>Nenhuma tabela carregada</strong>
              <span>As tabelas aparecem aqui depois que a API responder.</span>
            </div>
          )}
        </div>

        {selectedTable ? (
          <article className="table-detail">
          <div className="detail-title-row">
            <div>
              <p className="section-label">Detalhes</p>
              <h2>{selectedTable.name}</h2>
              <span>{selectedTable.technicalName}</span>
            </div>
            <StatusBadge status={selectedTable.status} />
          </div>

          <div className="detail-grid">
            <DetailItem label="Tipo" value={selectedTable.datasetKind === "fact" ? "Fato" : "Dimensao"} />
            <DetailItem label="Frequencia" value={selectedTable.frequency} />
            <DetailItem label="Campo de periodo" value={selectedTable.periodField} />
            <DetailItem label="Ultima carga" value={selectedTable.lastLoad ? formatHistoryDate(selectedTable.lastLoad) : "Sem carga"} />
            <DetailItem label="Arquivo" value={selectedTable.lastSourceFile || "-"} />
            <DetailItem label="Linhas da ultima carga" value={String(selectedTable.rowCount || 0)} />
            <DetailItem label="Colunas" value={String(selectedTable.columnCount || selectedTable.columns.length)} />
          </div>

          <section className="columns-panel">
            <h3>Colunas cadastradas</h3>
            <div>
              {(selectedTable.columns.length ? selectedTable.columns : ["Schema pendente"]).map((column) => (
                <span key={column}>{column}</span>
              ))}
            </div>
          </section>
        </article>
        ) : null}
      </div>
    </section>
  );
}

function DataLoadHistory({ items, error, onRefresh }) {
  return (
    <section className="registered-tables">
      <div className="module-section-heading history-heading-row">
        <div>
          <p className="section-label">Historico</p>
          <h2>Cargas confirmadas</h2>
          <p>Veja os arquivos gravados no Lakehouse.</p>
        </div>
        <button type="button" onClick={onRefresh}>
          Atualizar
        </button>
      </div>

      {error ? (
        <div className="system-result blocked">
          <strong>Nao foi possivel carregar</strong>
          <span>{error}</span>
        </div>
      ) : null}

      <div className="history-list">
        {items.length ? (
          items.map((item) => (
            <article className="history-item" key={item.load_id}>
              <div>
                <strong>{item.table_name}</strong>
                <span>{item.source_file}</span>
              </div>
              <DetailItem label="Tipo" value={item.dataset_kind === "fact" ? "Fato" : "Dimensao"} />
              <DetailItem label="Linhas" value={String(item.row_count)} />
              <DetailItem label="Data" value={formatHistoryDate(item.created_at)} />
              <StatusBadge status="ready" />
            </article>
          ))
        ) : (
          <div className="system-result">
            <strong>Nenhuma carga confirmada</strong>
            <span>As cargas aprovadas vao aparecer aqui depois da confirmacao.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatHistoryDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function StatusBadge({ status }) {
  const labels = {
    ready: "Pronta",
    review: "Revisar",
    blocked: "Bloqueada",
  };
  return <span className={`status-badge ${status}`}>{labels[status] || status}</span>;
}

function NewLoadWizard({ form, setForm, step, setStep, steps, onCommitted }) {
  const fileInputRef = useRef(null);
  const schemaRows = form.detectedColumns || [];
  const hasDetectedSchema = schemaRows.length > 0;
  const isNewTable = form.detectedStatus === "new";
  const hasStructureIssue = form.detectedStatus === "blocked";
  const isFactFile = form.datasetKind === "fact";
  const tableTypeLabel = form.datasetKind ? (isFactFile ? "Tabela fato" : "Tabela dimensao") : "Aguardando arquivo";
  const hasLoadSettings =
    Boolean(form.frequency) &&
    Boolean(form.loadStrategy) &&
    (form.frequency === "once" || Boolean(form.referenceColumn));
  const canCommitLoad = Boolean(form.selectedFile) && hasDetectedSchema && hasLoadSettings && !hasStructureIssue;
  const validColumnTypes = new Set(["text", "integer", "decimal", "boolean", "date", "datetime"]);
  const hasValidColumnTypes = hasDetectedSchema && schemaRows.every((row) => validColumnTypes.has(row.type));
  const stepIsValid = [
    Boolean(form.selectedFile) && hasDetectedSchema && !form.isReadingSource && !form.sourceError,
    Boolean(form.dimensionName) && hasDetectedSchema && !form.isCheckingTable && !hasStructureIssue && !form.sourceError,
    hasLoadSettings,
    hasValidColumnTypes && !hasStructureIssue,
    canCommitLoad && hasValidColumnTypes,
  ];
  const maxAllowedStep = stepIsValid.reduce(
    (maximum, valid, index) => (index === maximum && valid ? maximum + 1 : maximum),
    0,
  );
  const canAdvance = step < steps.length - 1 && stepIsValid[step];

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSourceFile(file) {
    if (!file) return;
    setForm((current) => ({
      ...current,
      sourceMode: "upload",
      sourceFileName: file.name,
      selectedFile: file,
      sourceSheet: "",
      sourceRows: 0,
      sourceColumns: 0,
      sourceError: "",
      sourceNotice: "",
      commitResult: null,
      commitError: "",
      datasetKind: "",
      statusReason: "",
      detectedStatus: "pending",
      dimensionName: "",
      detectedColumns: [],
      frequency: "",
      referenceColumn: "",
      loadStrategy: "",
      isReadingSource: true,
    }));

    try {
      const preview = await requestDataLoadPreview(file);
      const draft = apiPreviewToDraft(preview);
      setForm((current) => ({
        ...current,
        ...draft,
        sourceMode: "upload",
        sourceError: "",
        sourceNotice: "",
        isReadingSource: false,
        isCheckingTable: true,
      }));
      try {
        const inspection = await inspectRegisteredTable(
          draft.dimensionName,
          draft.detectedColumns.map((column) => column.column),
        );
        setForm((current) => ({
          ...current,
          dimensionName: inspection.table_name,
          detectedStatus: inspection.status,
          statusReason: inspection.message,
          isCheckingTable: false,
        }));
      } catch (inspectionError) {
        setForm((current) => ({
          ...current,
          sourceError: inspectionError.message,
          isCheckingTable: false,
        }));
      }
    } catch (apiError) {
      if (apiError.status) {
        setForm((current) => ({
          ...current,
          sourceError: apiError.message,
          sourceNotice: "",
          isReadingSource: false,
        }));
        return;
      }
      try {
        const schema = await extractSchemaFromFile(file);
        const draft = createDimensionDraftFromSchema(file.name, schema.columns);
        setForm((current) => ({
          ...current,
          ...draft,
          sourceMode: "upload",
          sourceSheet: schema.sheetName,
          sourceRows: schema.rowCount,
          sourceColumns: schema.columnCount,
          sourceError: "",
          sourceNotice: "Sem conexao com a API. Preview limitado feito no navegador.",
          isReadingSource: false,
        }));
      } catch (error) {
        setForm((current) => ({
          ...current,
          sourceMode: "upload",
          dimensionName: "",
          datasetKind: "",
          detectedStatus: "pending",
          statusReason: "",
          detectedColumns: [],
          sourceError: `${file.name}: ${error.message}`,
          sourceNotice: "",
          isReadingSource: false,
        }));
      }
    }
  }

  async function recheckTable() {
    if (!form.selectedFile || !form.dimensionName) return;
    updateField("isCheckingTable", true);
    try {
      const inspection = await inspectRegisteredTable(
        form.dimensionName,
        form.detectedColumns.map((column) => column.column),
      );
      setForm((current) => ({
        ...current,
        dimensionName: inspection.table_name,
        detectedStatus: inspection.status,
        statusReason: inspection.message,
        isCheckingTable: false,
        sourceError: "",
      }));
    } catch (error) {
      setForm((current) => ({ ...current, isCheckingTable: false, sourceError: error.message }));
    }
  }

  function handleDroppedSourceFile(event) {
    event.preventDefault();
    handleSourceFile(event.dataTransfer.files[0]);
  }

  function handleSelectedSourceFile(event) {
    handleSourceFile(event.target.files[0]);
    event.target.value = "";
  }

  function updateFrequency(value) {
    setForm((current) => ({
      ...current,
      frequency: value,
      referenceColumn: value === "daily" ? "data_ref" : value === "monthly" ? "mes_ref" : current.referenceColumn,
    }));
  }

  function updateColumnType(columnName, type) {
    setForm((current) => ({
      ...current,
      detectedColumns: current.detectedColumns.map((column) =>
        column.column === columnName ? { ...column, type } : column,
      ),
    }));
  }

  async function handleCommitLoad() {
    if (!form.selectedFile || hasStructureIssue) return;

    setForm((current) => ({ ...current, isCommitting: true, commitError: "", commitResult: null }));

    try {
      const result = await commitDataLoad(form.selectedFile, form);
      setForm((current) => ({
        ...current,
        isCommitting: false,
        commitResult: result,
        commitError: "",
      }));
      onCommitted?.();
    } catch (error) {
      setForm((current) => ({
        ...current,
        isCommitting: false,
        commitError: error.message,
      }));
    }
  }

  return (
    <section className="load-wizard">
      <div className="wizard-progress" aria-label="Etapas da nova carga">
        {steps.map((label, index) => (
          <button
            key={label}
            className={index === step ? "active" : index < step ? "done" : ""}
            type="button"
            onClick={() => setStep(index)}
            disabled={index > maxAllowedStep}
          >
            <span>{index + 1}</span>
            {label}
          </button>
        ))}
      </div>

      <section className="wizard-panel">
        {step === 0 ? (
          <WizardStep title="Enviar dados" description="Escolha de onde o sistema deve ler os dados da tabela. Depois disso, ele identifica nome e colunas automaticamente.">
            <div className="choice-grid three">
              <ChoiceButton
                active={form.sourceMode === "upload"}
                title="Enviar arquivo"
                description="Selecionar um arquivo do computador para verificacao."
                onClick={() => updateField("sourceMode", "upload")}
              />
              <ChoiceButton
                active={form.sourceMode === "lakehouse"}
                title="Lakehouse"
                description="Usar uma tabela ou pasta que ja esta no Lakehouse."
                onClick={() => updateField("sourceMode", "lakehouse")}
              />
              <ChoiceButton
                active={form.sourceMode === "external"}
                title="Caminho externo"
                description="Informar um local externo que o sistema consiga acessar."
                onClick={() => updateField("sourceMode", "external")}
              />
            </div>

            {form.sourceMode === "upload" ? (
              <div
                className="source-dropzone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDroppedSourceFile}
              >
                <FileArchive size={28} />
                <strong>
                  {form.isReadingSource ? "Lendo arquivo..." : form.sourceFileName || "Arraste o arquivo aqui"}
                </strong>
                <span>
                  {form.sourceSheet
                    ? `Aba ${form.sourceSheet}: ${form.sourceRows} linhas e ${form.sourceColumns} colunas encontradas.`
                    : "O sistema vai ler o arquivo e encontrar o nome da tabela e suas colunas."}
                </span>
                <button type="button" onClick={() => fileInputRef.current?.click()}>
                  Selecionar arquivo
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".delta,.parquet,.csv,.xlsx,.xlsm"
                  onChange={handleSelectedSourceFile}
                />
              </div>
            ) : (
              <label className="field">
                <span>{form.sourceMode === "lakehouse" ? "Local no Lakehouse" : "Caminho externo"}</span>
                <input
                  value={form.sourcePath}
                  onChange={(event) => updateField("sourcePath", event.target.value)}
                  placeholder="lakehouse://..."
                />
              </label>
            )}
          </WizardStep>
        ) : null}

        {step === 1 ? (
          <WizardStep title="Conferir tabela" description="O sistema compara o que foi enviado com as tabelas ja salvas e decide se e uma nova tabela ou uma nova carga.">
            <div className="schema-summary">
              <StatusCard title="Nome encontrado" detail={friendlyDimensionName(form.dimensionName)} />
              <StatusCard title="Situacao" detail={detectedStatusLabel(form.detectedStatus)} tone={form.detectedStatus} />
              <StatusCard title="Origem" detail={sourceModeLabel(form.sourceMode)} />
              <StatusCard title="Tipo encontrado" detail={tableTypeLabel} tone={isFactFile ? "new" : ""} />
            </div>
            {form.isCheckingTable ? (
              <div className="system-result">
                <strong>Consultando o Fabric</strong>
                <span>Verificando se a tabela e suas colunas ja existem no Lakehouse.</span>
              </div>
            ) : null}
            {form.sourceError ? (
              <div className="system-result blocked">
                <strong>Leitura local indisponivel</strong>
                <span>{form.sourceError}</span>
              </div>
            ) : null}
            {form.sourceNotice ? (
              <div className="system-result">
                <strong>Preview local</strong>
                <span>{form.sourceNotice}</span>
              </div>
            ) : null}
            {hasDetectedSchema ? (
              <div className={`system-result ${form.detectedStatus}`}>
                <strong>{isFactFile ? "Tabela fato encontrada" : detectedResultTitle(form.detectedStatus)}</strong>
                <span>{detectedResultText(form.detectedStatus, form.statusReason)}</span>
              </div>
            ) : (
              <div className="system-result">
                <strong>Aguardando arquivo</strong>
                <span>Envie um arquivo para a API ler nome, tipo e colunas da tabela.</span>
              </div>
            )}
            <label className="field">
              <span>Nome da tabela</span>
              <input
                value={form.dimensionName}
                onChange={(event) => updateField("dimensionName", event.target.value)}
                onBlur={recheckTable}
                placeholder="Preenchido depois da leitura do arquivo"
              />
            </label>
          </WizardStep>
        ) : null}

        {step === 2 ? (
          <WizardStep title="Frequencia da carga" description="Informe se essa carga acontece uma vez ou se sera feita por dia ou por mes.">
            {!hasDetectedSchema ? (
              <div className="system-result">
                <strong>Aguardando arquivo</strong>
                <span>Escolha a periodicidade depois que a tabela for identificada.</span>
              </div>
            ) : null}
            <div className="choice-grid three">
              <ChoiceButton
                active={form.frequency === "once"}
                title="Unica"
                description="Carga pontual. Nao precisa informar campo de periodo."
                onClick={() => updateFrequency("once")}
              />
              <ChoiceButton
                active={form.frequency === "daily"}
                title="Diaria"
                description="Carga recorrente usando um campo de data."
                onClick={() => updateFrequency("daily")}
              />
              <ChoiceButton
                active={form.frequency === "monthly"}
                title="Mensal"
                description="Carga recorrente usando um campo de mes."
                onClick={() => updateFrequency("monthly")}
              />
            </div>
            <div className={form.frequency === "once" ? "form-row single" : "form-row"}>
              {form.frequency !== "once" ? (
                <label className="field">
                  <span>Campo que identifica o periodo</span>
                  <input
                    value={form.referenceColumn}
                    onChange={(event) => updateField("referenceColumn", event.target.value)}
                    placeholder={form.frequency === "monthly" ? "mes_ref" : "data_ref"}
                  />
                </label>
              ) : null}
              <label className="field">
                <span>Como gravar os dados</span>
                <select
                  value={form.loadStrategy}
                  onChange={(event) => updateField("loadStrategy", event.target.value)}
                >
                  <option value="">Selecione uma forma de gravacao</option>
                  <option value="replace_period">Trocar apenas o periodo enviado</option>
                  <option value="replace_all">Trocar a tabela inteira</option>
                  <option value="merge_key">Atualizar registros existentes</option>
                </select>
              </label>
            </div>
            {!hasLoadSettings ? (
              <div className="system-result blocked">
                <strong>Configuracao obrigatoria</strong>
                <span>Escolha a frequencia, a forma de gravacao e, quando aplicavel, o campo de periodo.</span>
              </div>
            ) : null}
          </WizardStep>
        ) : null}

        {step === 3 ? (
          <WizardStep title="Conferir colunas" description="Revise as colunas encontradas antes de confirmar a carga. Se a estrutura estiver diferente, o sistema bloqueia a gravacao.">
            {hasDetectedSchema ? (
              <div className="schema-summary">
                <StatusCard title={isNewTable ? "Tabela nova" : "Tabela cadastrada"} detail={schemaStatusDetail(form.detectedStatus)} tone={form.detectedStatus} />
                <StatusCard title="Tipo encontrado" detail={tableTypeLabel} tone={isFactFile ? "new" : ""} />
                <StatusCard title="Colunas encontradas" detail={`${schemaRows.length} colunas`} />
              </div>
            ) : null}
            {hasStructureIssue ? (
              <div className="system-result blocked">
                <strong>Carga bloqueada</strong>
                <span>A tabela ja existe, mas as colunas enviadas estao diferentes do modelo salvo. Nenhum dado sera gravado.</span>
              </div>
            ) : null}
            {hasDetectedSchema ? (
              <div className="schema-table">
                <table>
                  <thead>
                    <tr>
                      <th>Coluna</th>
                      <th>Tipo</th>
                      <th>Exemplo</th>
                      <th>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schemaRows.map((row) => (
                      <tr key={row.column}>
                        <td>{row.column}</td>
                        <td>
                          <select
                            aria-label={`Tipo da coluna ${row.column}`}
                            value={row.type}
                            onChange={(event) => updateColumnType(row.column, event.target.value)}
                          >
                            <option value="text">Texto</option>
                            <option value="integer">Numero inteiro</option>
                            <option value="decimal">Numero decimal</option>
                            <option value="boolean">Sim/nao</option>
                            <option value="date">Data</option>
                            <option value="datetime">Data e hora</option>
                          </select>
                        </td>
                        <td>{row.example}</td>
                        <td>{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="system-result">
                <strong>Nenhuma coluna lida</strong>
                <span>As colunas aparecem aqui depois que a API processa o arquivo.</span>
              </div>
            )}
          </WizardStep>
        ) : null}

        {step === 4 ? (
          <WizardStep title="Confirmar envio" description="Confira o resumo antes de enviar. Seu acesso corporativo sera validado antes da gravacao.">
            <div className="confirmation-list">
              <SummaryItem label="Tabela" value={friendlyDimensionName(form.dimensionName)} />
              <SummaryItem label="Tipo" value={tableTypeLabel} />
              <SummaryItem label="Situacao" value={detectedStatusLabel(form.detectedStatus)} />
              <SummaryItem label="Origem" value={sourceSummary(form)} />
              <SummaryItem label="Frequencia" value={form.frequency ? frequencyLabel(form.frequency) : "-"} />
              <SummaryItem label="Campo de periodo" value={form.frequency === "once" ? "Nao se aplica" : form.referenceColumn || "-"} />
              <SummaryItem label="Gravacao" value={form.loadStrategy ? strategyLabel(form.loadStrategy) : "-"} />
            </div>
            <div className={`api-note ${hasStructureIssue ? "blocked" : ""}`}>
              <Lock size={18} />
              <span>
                {hasStructureIssue
                  ? "Esta carga nao sera enviada porque a estrutura nao confere com o modelo salvo."
                  : "Seu acesso e a estrutura do arquivo serao validados antes de salvar qualquer dado."}
              </span>
            </div>
            {form.commitResult ? (
              <div className="system-result ready">
                <strong>Carga concluida</strong>
                <span>
                  {form.commitResult.message} Local: {form.commitResult.output_path}
                </span>
              </div>
            ) : null}
            {form.commitError ? (
              <div className="system-result blocked">
                <strong>Falha ao confirmar</strong>
                <span>{form.commitError}</span>
              </div>
            ) : null}
          </WizardStep>
        ) : null}

        <footer className="wizard-actions">
          <button type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
            <ChevronLeft size={18} />
            Voltar
          </button>
          {step === steps.length - 1 ? (
            <button
              type="button"
              onClick={handleCommitLoad}
              disabled={!canCommitLoad || !hasValidColumnTypes || form.isCommitting}
            >
              {form.isCommitting ? "Confirmando..." : "Confirmar carga"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep(Math.min(steps.length - 1, step + 1))}
              disabled={!canAdvance}
            >
              Avancar
              <ChevronRight size={18} />
            </button>
          )}
        </footer>
      </section>
    </section>
  );
}

function WizardStep({ eyebrow = "Nova carga", title, description, children }) {
  return (
    <div className="wizard-step">
      <div>
        <p className="section-label">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}

function ChoiceButton({ active, title, description, onClick }) {
  return (
    <button className={active ? "active" : ""} type="button" onClick={onClick}>
      <strong>{title}</strong>
      <small>{description}</small>
    </button>
  );
}

function StatusCard({ title, detail, tone = "" }) {
  return (
    <div className={`status-card ${tone}`}>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div className="summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BiModule() {
  const [activeSection, setActiveSection] = useState("new-publish");
  const [publishStep, setPublishStep] = useState(0);
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceError, setWorkspaceError] = useState("");
  const [biHistory, setBiHistory] = useState([]);
  const [biHistoryError, setBiHistoryError] = useState("");
  const [publishForm, setPublishForm] = useState({
    pbixName: "",
    selectedFile: null,
    reportName: "",
    workspaceId: "",
    workspaceName: "",
    userRole: "",
    hasWorkspaceAccess: false,
    hasPublishPermission: false,
    isReportAuthorized: false,
    validationStatus: "pending",
    validationMessage: "",
    publishMode: "",
    isValidating: false,
    isPublishing: false,
    publishResult: null,
    publishError: "",
  });
  const sections = [
    {
      id: "new-publish",
      icon: FileUp,
      title: "Nova publicacao",
      description: "Fluxo guiado para publicar um PBIX com validacao de acesso.",
    },
    {
      id: "workspaces",
      icon: BarChart3,
      title: "Workspaces",
      description: "Lista de areas disponiveis e permissao do usuario.",
    },
    {
      id: "history",
      icon: History,
      title: "Historico",
      description: "Publicacoes recentes e seus resultados.",
    },
  ];
  const publishSteps = ["Enviar PBIX", "Workspace", "Validacao", "Confirmar"];

  async function refreshBiWorkspaces() {
    try {
      const items = await getBiWorkspaces();
      setWorkspaces(items);
      setWorkspaceError("");
    } catch (error) {
      setWorkspaceError(error.message);
    }
  }

  async function refreshBiHistory() {
    try {
      const items = await getBiHistory();
      setBiHistory(items);
      setBiHistoryError("");
    } catch (error) {
      setBiHistoryError(error.message);
    }
  }

  useEffect(() => {
    refreshBiWorkspaces();
    refreshBiHistory();
  }, []);

  return (
    <section className="dimension-module">
      <div className="module-heading">
        <p className="section-label">Modulo</p>
        <h1>Publicacao de BI</h1>
        <p>
          Processo para enviar arquivos PBIX, escolher a workspace e publicar somente apos validar acesso e autorizacao.
        </p>
      </div>

      <nav className="module-section-cards" aria-label="Areas do modulo">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              className={activeSection === section.id ? "active" : ""}
              type="button"
              onClick={() => setActiveSection(section.id)}
            >
              <span>
                <Icon size={20} />
              </span>
              <strong>{section.title}</strong>
              <small>{section.description}</small>
            </button>
          );
        })}
      </nav>

      {activeSection === "new-publish" ? (
        <BiPublishWizard
          form={publishForm}
          setForm={setPublishForm}
          step={publishStep}
          setStep={setPublishStep}
          steps={publishSteps}
          workspaces={workspaces}
          workspaceError={workspaceError}
          onPublished={refreshBiHistory}
        />
      ) : activeSection === "workspaces" ? (
        <BiWorkspaces form={publishForm} setForm={setPublishForm} workspaces={workspaces} error={workspaceError} onRefresh={refreshBiWorkspaces} />
      ) : (
        <BiHistory items={biHistory} error={biHistoryError} onRefresh={refreshBiHistory} />
      )}
    </section>
  );
}

function BiPublishWizard({ form, setForm, step, setStep, steps, workspaces, workspaceError, onPublished }) {
  const pbixInputRef = useRef(null);
  const canPublish = form.validationStatus === "ready";

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handlePbix(file) {
    if (!file) return;
    setForm((current) => ({
      ...current,
      selectedFile: file,
      pbixName: file.name,
      reportName: file.name.replace(/\.pbix$/i, "").replace(/[_-]+/g, " "),
      validationStatus: "pending",
      validationMessage: "",
      publishResult: null,
      publishError: "",
    }));
  }

  async function validatePublish(nextForm = form) {
    if (!nextForm.selectedFile || !nextForm.workspaceId) return;

    setForm((current) => ({ ...current, isValidating: true, publishError: "", publishResult: null }));
    try {
      const preview = await previewBiPublish(nextForm.selectedFile, nextForm.workspaceId, nextForm.reportName);
      setForm((current) => ({
        ...current,
        workspaceId: preview.workspace_id,
        workspaceName: preview.workspace_name,
        reportName: preview.report_name,
        userRole: preview.user_role,
        hasWorkspaceAccess: preview.has_workspace_access,
        hasPublishPermission: preview.has_publish_permission,
        isReportAuthorized: preview.is_report_authorized,
        validationStatus: preview.status,
        validationMessage: preview.message,
        isValidating: false,
      }));
    } catch (error) {
      setForm((current) => ({
        ...current,
        validationStatus: "blocked",
        validationMessage: error.message,
        isValidating: false,
      }));
    }
  }

  async function publishBi() {
    if (!canPublish || !form.selectedFile) return;
    setForm((current) => ({ ...current, isPublishing: true, publishError: "", publishResult: null }));
    try {
      const result = await commitBiPublish(form.selectedFile, form.workspaceId, form.reportName, form.publishMode);
      setForm((current) => ({
        ...current,
        isPublishing: false,
        publishResult: result,
      }));
      onPublished?.();
    } catch (error) {
      setForm((current) => ({
        ...current,
        isPublishing: false,
        publishError: error.message,
      }));
    }
  }

  return (
    <section className="load-wizard">
      <div className="wizard-progress" aria-label="Etapas da publicacao">
        {steps.map((label, index) => (
          <button
            key={label}
            className={index === step ? "active" : index < step ? "done" : ""}
            type="button"
            onClick={() => setStep(index)}
          >
            <span>{index + 1}</span>
            {label}
          </button>
        ))}
      </div>

      <section className="wizard-panel">
        {step === 0 ? (
          <WizardStep eyebrow="Nova publicacao" title="Enviar PBIX" description="Selecione o arquivo que sera publicado no Power BI. O sistema usa esse arquivo para sugerir o nome do relatorio.">
            <div
              className="source-dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handlePbix(event.dataTransfer.files[0]);
              }}
            >
              <FileUp size={28} />
              <strong>{form.pbixName || "Arraste o PBIX aqui"}</strong>
              <span>Depois do envio, escolha a workspace onde o relatorio deve ser publicado.</span>
              <button type="button" onClick={() => pbixInputRef.current?.click()}>
                Selecionar PBIX
              </button>
              <input
                ref={pbixInputRef}
                type="file"
                accept=".pbix"
                onChange={(event) => handlePbix(event.target.files[0])}
              />
            </div>
            <label className="field">
              <span>Nome do relatorio</span>
              <input
                value={form.reportName}
                onChange={(event) => updateField("reportName", event.target.value)}
                placeholder="Ex.: Relatorio Comercial"
              />
            </label>
          </WizardStep>
        ) : null}

        {step === 1 ? (
          <WizardStep eyebrow="Nova publicacao" title="Workspace" description="Escolha a area onde o relatorio sera publicado. A validacao confere se voce tem acesso suficiente nessa workspace.">
            {workspaceError ? (
              <div className="system-result blocked">
                <strong>Nao foi possivel carregar workspaces</strong>
                <span>{workspaceError}</span>
              </div>
            ) : null}
            <div className="choice-grid three">
              {workspaces.length ? workspaces.map((workspace) => (
                <ChoiceButton
                  key={workspace.id}
                  active={form.workspaceId === workspace.id}
                  title={workspace.name}
                  description={`${workspace.userRole} - ${workspace.canPublish ? "publicacao autorizada" : "sem autorizacao"}`}
                  onClick={() => {
                    const next = {
                      ...form,
                      workspaceId: workspace.id,
                      workspaceName: workspace.name,
                      userRole: workspace.userRole,
                      hasPublishPermission: workspace.canPublish,
                    };
                    setForm((current) => ({
                      ...current,
                      ...next,
                      validationStatus: "pending",
                      validationMessage: "",
                    }));
                    validatePublish(next);
                  }}
                />
              )) : (
                <div className="system-result">
                  <strong>Nenhuma workspace carregada</strong>
                  <span>As workspaces aparecem aqui depois que a API responder.</span>
                </div>
              )}
            </div>
            <label className="field">
              <span>Como publicar</span>
              <select
                value={form.publishMode}
                onChange={(event) => updateField("publishMode", event.target.value)}
              >
                <option value="">Selecione uma opcao</option>
                <option value="replace">Substituir relatorio se ja existir</option>
                <option value="new">Criar como novo relatorio</option>
              </select>
            </label>
          </WizardStep>
        ) : null}

        {step === 2 ? (
          <WizardStep eyebrow="Nova publicacao" title="Validacao" description="Antes de publicar, o sistema confere duas coisas: seu acesso na workspace e sua autorizacao para publicar BI.">
            <div className="schema-summary">
              <StatusCard
                title="Acesso na workspace"
                detail={form.userRole ? `Acesso como ${form.userRole}` : "Aguardando workspace"}
                tone={form.hasWorkspaceAccess ? "ready" : form.workspaceId ? "blocked" : ""}
              />
              <StatusCard
                title="Autorizacao para publicar"
                detail={form.hasPublishPermission ? "Usuario autorizado" : "Usuario sem autorizacao"}
                tone={form.hasPublishPermission ? "ready" : "blocked"}
              />
              <StatusCard
                title="Relatorio"
                detail={form.isReportAuthorized ? "Autorizado" : "Aguardando autorizacao"}
                tone={form.isReportAuthorized ? "ready" : form.workspaceId ? "blocked" : ""}
              />
              <StatusCard
                title="Resultado"
                detail={form.isValidating ? "Validando..." : canPublish ? "Liberada" : "Bloqueada"}
                tone={canPublish ? "ready" : "blocked"}
              />
            </div>
            <div className={`system-result ${canPublish ? "ready" : "blocked"}`}>
              <strong>{canPublish ? "Publicacao liberada" : "Publicacao bloqueada"}</strong>
              <span>{form.validationMessage || "Selecione um PBIX e uma workspace para validar."}</span>
            </div>
            <div className="wizard-inline-actions">
              <button type="button" onClick={() => validatePublish()} disabled={!form.selectedFile || !form.workspaceId || form.isValidating}>
                {form.isValidating ? "Validando..." : "Validar novamente"}
              </button>
            </div>
          </WizardStep>
        ) : null}

        {step === 3 ? (
          <WizardStep eyebrow="Nova publicacao" title="Confirmar publicacao" description="Confira o resumo. A publicacao sera executada com a identidade de servico configurada para o ambiente.">
            <div className="confirmation-list">
              <SummaryItem label="Arquivo" value={form.pbixName || "PBIX pendente"} />
              <SummaryItem label="Relatorio" value={form.reportName || "-"} />
              <SummaryItem label="Workspace" value={form.workspaceName || "-"} />
              <SummaryItem label="Seu acesso" value={form.userRole || "-"} />
              <SummaryItem label="Autorizacao" value={form.hasPublishPermission ? "Autorizado" : "Nao autorizado"} />
              <SummaryItem label="Como publicar" value={form.publishMode ? publishModeLabel(form.publishMode) : "-"} />
            </div>
            <div className={`api-note ${canPublish ? "" : "blocked"}`}>
              <Lock size={18} />
              <span>
                {canPublish
                  ? "A publicacao sera executada com usuario de servico, mantendo auditoria de quem solicitou."
                  : "Esta publicacao nao sera enviada porque a validacao nao foi aprovada."}
              </span>
            </div>
            {form.publishResult ? (
              <div className="system-result ready">
                <strong>Publicacao concluida</strong>
                <span>{form.publishResult.message} Local: {form.publishResult.output_path}</span>
              </div>
            ) : null}
            {form.publishError ? (
              <div className="system-result blocked">
                <strong>Falha ao publicar</strong>
                <span>{form.publishError}</span>
              </div>
            ) : null}
          </WizardStep>
        ) : null}

        <footer className="wizard-actions">
          <button type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
            <ChevronLeft size={18} />
            Voltar
          </button>
          {step === steps.length - 1 ? (
            <button type="button" onClick={publishBi} disabled={!canPublish || !form.publishMode || form.isPublishing}>
              {form.isPublishing ? "Publicando..." : "Confirmar publicacao"}
            </button>
          ) : (
            <button type="button" onClick={() => setStep(Math.min(steps.length - 1, step + 1))}>
              Avancar
              <ChevronRight size={18} />
            </button>
          )}
        </footer>
      </section>
    </section>
  );
}

function BiWorkspaces({ form, setForm, workspaces, error, onRefresh }) {
  return (
    <section className="registered-tables">
      <div className="module-section-heading history-heading-row">
        <div>
          <p className="section-label">Workspaces</p>
          <h2>Areas disponiveis</h2>
          <p>Confira onde o usuario pode publicar e onde a publicacao fica bloqueada.</p>
        </div>
        <button type="button" onClick={onRefresh}>
          Atualizar
        </button>
      </div>

      {error ? (
        <div className="system-result blocked">
          <strong>Nao foi possivel carregar</strong>
          <span>{error}</span>
        </div>
      ) : null}

      <div className="workspace-grid">
        {workspaces.length ? workspaces.map((workspace) => {
          const selected = workspace.id === form.workspaceId;
          const canAccess = ["Admin", "Membro"].includes(workspace.userRole);
          const canPublish = canAccess && workspace.canPublish;
          return (
            <button
              key={workspace.id}
              className={selected ? "workspace-card active" : "workspace-card"}
              type="button"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  workspaceId: workspace.id,
                  workspaceName: workspace.name,
                  userRole: workspace.userRole,
                  hasPublishPermission: workspace.canPublish,
                  validationStatus: "pending",
                  validationMessage: "",
                }))
              }
            >
              <div>
                <strong>{workspace.name}</strong>
                <span>Acesso: {workspace.userRole}</span>
              </div>
              <StatusBadge status={canPublish ? "ready" : "blocked"} />
            </button>
          );
        }) : (
          <div className="system-result">
            <strong>Nenhuma workspace carregada</strong>
            <span>As workspaces aparecem aqui depois que a API responder.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function BiHistory({ items, error, onRefresh }) {
  return (
    <section className="registered-tables">
      <div className="module-section-heading history-heading-row">
        <div>
          <p className="section-label">Historico</p>
          <h2>Publicacoes recentes</h2>
          <p>Acompanhe as publicacoes solicitadas pelo portal.</p>
        </div>
        <button type="button" onClick={onRefresh}>
          Atualizar
        </button>
      </div>

      {error ? (
        <div className="system-result blocked">
          <strong>Nao foi possivel carregar</strong>
          <span>{error}</span>
        </div>
      ) : null}

      <div className="history-list">
        {items.length ? items.map((item) => (
          <article className="history-item" key={item.publish_id}>
            <div>
              <strong>{item.report_name}</strong>
              <span>{item.workspace_name}</span>
            </div>
            <DetailItem label="Arquivo" value={item.file_name} />
            <DetailItem label="Data" value={formatHistoryDate(item.created_at)} />
            <StatusBadge status={item.status === "completed" ? "ready" : "blocked"} />
          </article>
        )) : (
          <div className="system-result">
            <strong>Nenhuma publicacao confirmada</strong>
            <span>As publicacoes aprovadas vao aparecer aqui depois da confirmacao.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function publishModeLabel(value) {
  const labels = {
    replace: "Substituir relatorio se ja existir",
    new: "Criar como novo relatorio",
  };
  return labels[value] || value;
}

createRoot(document.getElementById("root")).render(<App />);
