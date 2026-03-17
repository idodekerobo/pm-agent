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
    product_name: Optional[str] = None
    product_description: Optional[str] = None
    use_case: Optional[str] = None
    onboarding_scrape_observations: Optional[str] = None
    onboarding_scrape_correction: Optional[str] = None
    current_focus: Optional[list[str]] = None
    daily_activities: Optional[list[str]] = None
    enable_agent_monitoring: bool = True


class UserCreate(UserBase):
    """User creation schema for POST requests."""

    pass


class User(UserBase):
    """Full user schema for read responses."""

    id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
