from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_environment: str
    client_app_base_url: str
    allowed_origins: list[str] = []

    supabase_url: str
    supabase_secret_key: str
    workspace_backend: str

    openai_api_key: str

    oauth_encryption_key: str
    session_secret: str
    linear_client_id: str = ""
    linear_client_secret: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""
    notion_client_id: str = ""
    notion_client_secret: str = ""

    slack_client_id: str = ""
    slack_client_secret: str = ""
    slack_signing_secret: str = ""

    redis_url: str = ""

    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    def model_post_init(self, __context) -> None:
        self.allowed_origins = [self.client_app_base_url]

settings = Settings()