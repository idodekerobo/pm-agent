import os
from fastapi import FastAPI
from app.config import settings
from app.api.routes.health import router as health_router
from app.api.routes.run import router as run_router
os.environ["OPENAI_API_KEY"] = settings.openai_api_key

app = FastAPI()
app.include_router(health_router)
app.include_router(run_router)