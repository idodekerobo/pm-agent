from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_environment: str
    allowed_origins: list[str] = ["http://localhost:3000"]

    supabase_url: str
    supabase_secret_key: str
    workspace_backend: str

    openai_api_key: str

    oauth_encryption_key: str
    session_secret: str
    linear_client_id: str = ""
    linear_client_secret: str = ""

    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_file_encoding="utf-8",
        extra="ignore",
    )

settings = Settings()