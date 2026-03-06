"""User schema for authentication and user management."""

from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import Optional


class UserBase(BaseModel):
    """Base user schema with essential fields."""

    email: str
    organization_id: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    company_name: Optional[str] = None
    company_url: Optional[str] = None
    product_description: Optional[str] = None
    use_case: Optional[str] = None


class UserCreate(UserBase):
    """User creation schema for POST requests."""

    pass


class UserProfile(BaseModel):
    """Writable profile fields for POST/PATCH /user/profile."""

    full_name: str
    role: str
    company_name: Optional[str] = None
    company_url: Optional[str] = None
    product_description: Optional[str] = None
    use_case: Optional[str] = None


class User(UserBase):
    """Full user schema for read responses."""

    id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
