from fastapi import APIRouter

from .slack import router as slack_router

router = APIRouter(prefix="/webhook")

router.include_router(slack_router)
