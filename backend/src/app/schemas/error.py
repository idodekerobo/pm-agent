from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import Any, Literal, Optional


ErrorPlatform = Literal["server", "worker", "agent", "web_app"]


class ErrorBase(BaseModel):
    user_id: Optional[UUID] = None
    platform: ErrorPlatform
    error_type: Optional[str] = None
    message: str
    stack_trace: Optional[str] = None
    context: dict[str, Any] = {}


class ErrorCreate(ErrorBase):
    pass


class Error(ErrorBase):
    id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
