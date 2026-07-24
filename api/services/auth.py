import os

from fastapi import HTTPException, Request

from api.schemas import CurrentUser
from api.services.app_config import get_config, get_current_user, is_local_auth_enabled

ROLE_ALIASES = {
    "data-loader": {"data-loader", "admin"},
    "bi-publisher": {"bi-publisher", "admin"},
}


def get_request_user(request: Request) -> CurrentUser:
    easy_auth_user = user_from_easy_auth_headers(request)
    if easy_auth_user:
        return easy_auth_user

    local_test_user = user_from_explicit_local_bypass(request)
    if local_test_user:
        return local_test_user

    if not is_local_auth_enabled():
        raise HTTPException(status_code=401, detail="Login obrigatorio para acessar o portal.")

    local_user = get_current_user()
    return CurrentUser(
        email=local_user["email"],
        name=local_user["name"],
        auth_provider=get_config().get("auth", {}).get("mode", "local"),
        roles=local_user.get("roles", []),
    )


def user_from_explicit_local_bypass(request: Request) -> CurrentUser | None:
    enabled = os.environ.get("SANTA_HELENA_LOCAL_AUTH", "").strip().lower() in {"1", "true", "yes"}
    client_host = request.client.host if request.client else ""
    if not enabled or client_host not in {"127.0.0.1", "::1", "localhost", "testclient"}:
        return None

    roles = [
        role.strip()
        for role in os.environ.get("SANTA_HELENA_LOCAL_ROLES", "data-loader,bi-publisher").split(",")
        if role.strip()
    ]
    return CurrentUser(
        email=os.environ.get("SANTA_HELENA_LOCAL_EMAIL", "teste.local@santahelena.com"),
        name=os.environ.get("SANTA_HELENA_LOCAL_NAME", "Teste local"),
        auth_provider="local_test_bypass",
        roles=roles,
    )


def user_from_easy_auth_headers(request: Request) -> CurrentUser | None:
    email = (
        request.headers.get("x-ms-client-principal-name")
        or request.headers.get("x-auth-request-email")
        or request.headers.get("x-forwarded-email")
    )
    if not email:
        return None

    name = request.headers.get("x-ms-client-principal-idp") or email
    roles_header = request.headers.get("x-ms-client-principal-roles", "")
    roles = [role.strip() for role in roles_header.split(",") if role.strip()]

    return CurrentUser(
        email=email,
        name=name,
        auth_provider="azure_app_service_easy_auth",
        roles=roles,
    )


def require_role(request: Request, role: str) -> CurrentUser:
    user = get_request_user(request)
    accepted = ROLE_ALIASES.get(role, {role})
    if not accepted.intersection(user.roles):
        raise HTTPException(status_code=403, detail="Voce nao tem permissao para executar esta operacao.")
    return user
