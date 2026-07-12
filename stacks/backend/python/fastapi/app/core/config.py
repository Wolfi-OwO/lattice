from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All environment access happens here.

    Pydantic validates and coerces at import time, so a missing or malformed
    variable fails at boot rather than on the first request that needs it.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "{{projectTitle}}"
    environment: str = "development"
    port: int = {{port}}

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/{{projectName}}"

    jwt_secret: str = "change-me-to-a-long-random-string"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60

    cors_origins: list[str] = ["http://localhost:{{clientPort}}"]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    """Cached so the file is parsed once and settings are importable anywhere."""
    return Settings()


settings = get_settings()
