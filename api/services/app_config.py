import json
import os
import re
from functools import lru_cache
from pathlib import Path

DEFAULT_CONFIG_PATH = Path("api/config/app_config.json")
LOCAL_CONFIG_PATH = Path("api/config/local_config.json")


def get_config_path() -> Path:
    if DEFAULT_CONFIG_PATH.exists():
        return DEFAULT_CONFIG_PATH

    return LOCAL_CONFIG_PATH


@lru_cache
def get_config() -> dict:
    raw = get_config_path().read_text(encoding="utf-8")
    expanded = re.sub(r"\$\{([A-Z0-9_]+)\}", lambda match: os.environ.get(match.group(1), match.group(0)), raw)
    config = json.loads(expanded)
    if config.get("app_env", "local").lower() in {"production", "prod"}:
        unresolved = re.findall(r"\$\{[A-Z0-9_]+\}", expanded)
        if unresolved:
            raise RuntimeError(f"Variaveis de ambiente obrigatorias ausentes: {', '.join(sorted(set(unresolved)))}")
        if config.get("storage", {}).get("provider") == "filesystem":
            raise RuntimeError("O provider filesystem nao pode ser usado em producao.")
    return config


def get_app_env() -> str:
    return get_config().get("app_env", "local").lower()


def is_local_auth_enabled() -> bool:
    auth_config = get_config().get("auth", {})
    if "allow_local_fallback" in auth_config:
        return bool(auth_config["allow_local_fallback"])

    return get_app_env() not in {"production", "prod"}


def get_cors_origins() -> list[str]:
    return get_config().get(
        "cors_origins",
        ["http://localhost:5173", "http://127.0.0.1:5173"],
    )


def get_current_user() -> dict:
    return get_config()["current_user"]


def get_power_bi_config() -> dict:
    return get_config()["power_bi"]


def get_storage_config() -> dict:
    return get_config().get("storage", {"provider": "filesystem", "root": "storage/lakehouse"})
