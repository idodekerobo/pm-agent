import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exception_handlers import http_exception_handler
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.sessions import SessionMiddleware
from app.config import settings
from app.api.routes.health import router as health_router
from app.api.routes.run import router as run_router
from app.api.routes.integrations import router as integrations_router
from app.api.routes.slack_routes import router as slack_router
from app.api.routes.webhooks import router as webhooks_router
from app.api.routes.sessions import router as sessions_router
from app.api.routes.filesystem import router as filesystem_router
from app.api.routes.errors import router as errors_router
from app.errors import log_error

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

@app.exception_handler(StarletteHTTPException)
async def global_http_exception_handler(request: Request, exc: StarletteHTTPException):
    user_id = getattr(request.state, "user_id", None)
    await log_error(user_id, "server", exc, context={
        "route": str(request.url.path),
        "method": request.method,
        "status_code": exc.status_code,
    })
    return await http_exception_handler(request, exc)


@app.exception_handler(Exception)
async def global_unhandled_exception_handler(request: Request, exc: Exception):
    user_id = getattr(request.state, "user_id", None)
    await log_error(user_id, "server", exc, context={
        "route": str(request.url.path),
        "method": request.method,
    })
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.include_router(health_router)
app.include_router(run_router)
app.include_router(integrations_router)
app.include_router(slack_router)
app.include_router(webhooks_router)
app.include_router(sessions_router)
app.include_router(filesystem_router)
app.include_router(errors_router)