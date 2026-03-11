from fastapi import APIRouter

from .claude_code import router as claude_code_router
from .github import router as github_router
from .slack import router as slack_router
from .stripe import router as stripe_router

router = APIRouter(prefix="/webhook")

router.include_router(claude_code_router)
router.include_router(github_router)
router.include_router(slack_router)
router.include_router(stripe_router)
