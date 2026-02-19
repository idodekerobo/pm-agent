"""User schema for authentication and user management."""

from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime


class UserBase(BaseModel):
    """Base user schema with essential fields."""

    email: str


class UserCreate(UserBase):
    """User creation schema for POST requests."""

    pass


class User(UserBase):
    """Full user schema for read responses."""

    id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
