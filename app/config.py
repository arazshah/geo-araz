from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "ابزارهای مکانی آراز"
    app_env: str = "development"
    app_debug: bool = False

    mapir_api_key: str = ""
    mapir_base_url: str = "https://map.ir"

    request_timeout: float = Field(default=20.0, ge=1, le=60)
    cors_origins: str = (
        "http://localhost:8000,"
        "http://127.0.0.1:8000,"
        "https://geo.araz.me"
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
