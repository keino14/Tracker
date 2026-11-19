from __future__ import annotations

import os
import secrets
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    secret_key: str
    database_url: str
    cookie_secure: bool


def get_settings() -> Settings:
    secret = os.getenv("SECRET_KEY", "")
    if len(secret) < 32 or secret in {"secret", "123", "replace-with-a-long-random-secret"}:
        if os.getenv("APP_ENV", "development") == "production":
            raise RuntimeError("SECRET_KEY must be a unique random value of at least 32 characters")
        # Convenient local-only key. Production deployments must provide SECRET_KEY.
        secret = os.getenv("DEV_SECRET_KEY") or secrets.token_urlsafe(48)
    return Settings(
        secret_key=secret,
        database_url=os.getenv("DATABASE_URL", "sqlite:///./app.db"),
        cookie_secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
    )
