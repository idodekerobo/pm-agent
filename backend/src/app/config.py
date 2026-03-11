from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_environment: str
    api_base_url: str
    client_app_base_url: str
    allowed_origins: list[str] = []

    supabase_url: str
    supabase_secret_key: str
    workspace_backend: str

    # LLM Providers
    openai_api_key: str

    # Integrations
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
    github_app_id: str = ""
    github_app_slug: str = ""
    github_private_key: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    github_webhook_secret: str = ""

    # Code task sandbox hook secret — injected into sandbox env, verified on inbound hook calls
    code_task_hook_secret: str = ""

    # Payments
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    redis_url: str = ""

    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    def model_post_init(self, __context) -> None:
        self.allowed_origins = [self.client_app_base_url, "https://anxiously-nonvituperative-gricelda.ngrok-free.dev"]

settings = Settings()