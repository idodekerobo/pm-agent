import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from app.config import settings
from app.api.routes.health import router as health_router
from app.api.routes.run import router as run_router
from app.api.routes.integrations import router as integrations_router

os.environ["OPENAI_API_KEY"] = settings.openai_api_key

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret,
    https_only=(settings.app_environment == "production"),
    same_site="lax",
)

app.include_router(health_router)
app.include_router(run_router)
app.include_router(integrations_router)