"""Pydantic schemas for billing: plans, billing accounts, subscriptions, credit ledger, model usage."""

from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import Optional


# ============================================================
# Plan
# ============================================================

class Plan(BaseModel):
    id: UUID
    name: str
    monthly_credits: int
    max_workspaces: int
    stripe_price_id: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ============================================================
# Billing Account
# ============================================================

class BillingAccountBase(BaseModel):
    user_id: Optional[UUID] = None
    organization_id: Optional[str] = None
    stripe_customer_id: Optional[str] = None


class BillingAccount(BillingAccountBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ============================================================
# Subscription
# ============================================================

class SubscriptionBase(BaseModel):
    billing_account_id: UUID
    plan_id: UUID
    stripe_subscription_id: Optional[str] = None
    status: str = "active"
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None


class Subscription(SubscriptionBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ============================================================
# Credit Ledger
# ============================================================

class CreditLedgerEntryBase(BaseModel):
    billing_account_id: UUID
    delta: int
    type: str
    agent_session_id: Optional[UUID] = None
    expires_at: Optional[datetime] = None


class CreditLedgerEntry(CreditLedgerEntryBase):
    id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ============================================================
# Model Usage
# ============================================================

class ModelUsageBase(BaseModel):
    agent_session_id: UUID
    billing_account_id: UUID
    user_id: UUID
    organization_id: Optional[str] = None
    provider: str
    model: str
    byok: bool = False
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    cached_input_tokens: Optional[int] = None
    reasoning_tokens: Optional[int] = None
    input_token_price_usd: Optional[float] = None
    output_token_price_usd: Optional[float] = None
    provider_cost_usd: Optional[float] = None


class ModelUsage(ModelUsageBase):
    id: UUID
    credit_ledger_id: Optional[UUID] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

