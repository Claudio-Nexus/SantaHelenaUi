from pydantic import BaseModel


class ColumnPreview(BaseModel):
    column: str
    type: str = "a confirmar"
    example: str | None = None
    status: str = "OK"


class DataLoadPreview(BaseModel):
    file_name: str
    table_name: str
    friendly_name: str
    dataset_kind: str
    status: str
    message: str
    sheet_name: str
    header_row: int
    row_count: int
    column_count: int
    columns: list[ColumnPreview]


class DataLoadCommit(BaseModel):
    load_id: str
    table_name: str
    dataset_kind: str
    status: str
    message: str
    row_count: int
    column_count: int
    output_path: str
    frequency: str
    reference_column: str | None = None
    load_strategy: str
    requested_by: str


class DataLoadHistoryItem(BaseModel):
    load_id: str
    table_name: str
    dataset_kind: str
    source_file: str
    sheet_name: str
    row_count: int
    column_count: int
    created_at: str
    output_path: str
    frequency: str = "once"
    reference_column: str | None = None
    load_strategy: str = "replace_all"
    requested_by: str = "unknown"


class RegisteredTableItem(BaseModel):
    id: str
    name: str
    technical_name: str
    dataset_kind: str
    status: str
    frequency: str
    period_field: str
    last_load: str | None = None
    last_source_file: str | None = None
    row_count: int = 0
    column_count: int = 0
    columns: list[str]


class BiWorkspaceItem(BaseModel):
    id: str
    name: str
    user_role: str
    can_publish: bool


class BiPublishPreview(BaseModel):
    file_name: str
    report_name: str
    workspace_id: str
    workspace_name: str
    user_role: str
    has_workspace_access: bool
    has_publish_permission: bool
    is_report_authorized: bool
    status: str
    message: str


class BiPublishCommit(BaseModel):
    publish_id: str
    file_name: str
    report_name: str
    workspace_id: str
    workspace_name: str
    status: str
    message: str
    output_path: str


class BiPublishHistoryItem(BaseModel):
    publish_id: str
    file_name: str
    report_name: str
    workspace_id: str
    workspace_name: str
    requested_by: str
    created_at: str
    status: str
    output_path: str


class CurrentUser(BaseModel):
    email: str
    name: str
    auth_provider: str
    roles: list[str] = []


class ErrorResponse(BaseModel):
    detail: str
