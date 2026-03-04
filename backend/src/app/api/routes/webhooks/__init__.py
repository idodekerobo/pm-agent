from fastapi import APIRouter

from .github import router as github_router
from .slack import router as slack_router

router = APIRouter(prefix="/webhook")

router.include_router(github_router)
router.include_router(slack_router)
