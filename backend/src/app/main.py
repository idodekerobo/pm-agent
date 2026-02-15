from pydantic_settings import BaseSettings, SettingsConfigDict
from fastapi import FastAPI
from app.api.routes.health import router as health_router
from app.api.routes.run import router as run_router

class Settings(BaseSettings):
    openai_api_key: str
    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_file_encoding="utf-8",
        extra="ignore",
    )

settings = Settings()
import os
os.environ["OPENAI_API_KEY"] = settings.openai_api_key

app = FastAPI()
app.include_router(health_router)
app.include_router(run_router)