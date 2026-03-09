"""DB helpers for billing: billing_accounts, subscriptions, credit_ledger, model_usage."""

from datetime import datetime
from typing import Optional

from supabase import Client

from app.schemas.billing import BillingAccount, Subscription, CreditLedgerEntry


# ============================================================
# Billing accounts
# ============================================================

def get_billing_account_by_user_id(
    supabase: Client,
    *,
    user_id: str,
) -> BillingAccount | None:
    result = (
        supabase.table("billing_accounts")
        .select("*")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not result or not result.data:
        return None
    return BillingAccount.model_validate(result.data)


def get_billing_account_by_stripe_customer_id(
    supabase: Client,
    *,
    stripe_customer_id: str,
) -> BillingAccount | None:
    result = (
        supabase.table("billing_accounts")
        .select("*")
        .eq("stripe_customer_id", stripe_customer_id)
        .maybe_single()
        .execute()
    )
    if not result or not result.data:
        return None
    return BillingAccount.model_validate(result.data)


def update_billing_account_stripe_customer(
    supabase: Client,
    *,
    billing_account_id: str,
    stripe_customer_id: str,
) -> None:
    supabase.table("billing_accounts").update(
        {"stripe_customer_id": stripe_customer_id}
    ).eq("id", billing_account_id).execute()


# ============================================================
# Subscriptions
# ============================================================

def get_active_subscription(
    supabase: Client,
    *,
    billing_account_id: str,
) -> Subscription | None:
    result = (
        supabase.table("subscriptions")
        .select("*")
        .eq("billing_account_id", billing_account_id)
        .eq("status", "active")
        .maybe_single()
        .execute()
    )
    if not result.data:
        return None
    return Subscription.model_validate(result.data)


def upsert_subscription(
    supabase: Client,
    *,
    billing_account_id: str,
    plan_id: str,
    stripe_subscription_id: Optional[str],
    status: str,
    period_start: Optional[datetime],
    period_end: Optional[datetime],
) -> None:
    """
    Updates the existing subscription row for a billing account.
    There is always exactly one subscription per billing account
    (created by the handle_new_user trigger).
    """
    payload: dict = {
        "plan_id": plan_id,
        "status": status,
        "stripe_subscription_id": stripe_subscription_id,
        "current_period_start": period_start.isoformat() if period_start else None,
        "current_period_end": period_end.isoformat() if period_end else None,
    }
    supabase.table("subscriptions").update(payload).eq(
        "billing_account_id", billing_account_id
    ).execute()


# ============================================================
# Credit ledger
# ============================================================

def get_credit_balance(
    supabase: Client,
    *,
    billing_account_id: str,
) -> int:
    """
    Returns the current credit balance: sum of all non-expired ledger deltas.
    Subscription credits expire at period_end; signup/pack credits never expire.
    """
    now = datetime.utcnow().isoformat()
    result = (
        supabase.table("credit_ledger")
        .select("delta")
        .eq("billing_account_id", billing_account_id)
        .or_(f"expires_at.is.null,expires_at.gt.{now}")
        .execute()
    )
    return sum(row["delta"] for row in (result.data or []))


def grant_credits(
    supabase: Client,
    *,
    billing_account_id: str,
    delta: int,
    type: str,
    expires_at: Optional[datetime] = None,
) -> str:
    """
    Inserts a positive credit event. Returns the new ledger row id.
    """
    payload: dict = {
        "billing_account_id": billing_account_id,
        "delta": delta,
        "type": type,
    }
    if expires_at is not None:
        payload["expires_at"] = expires_at.isoformat()

    result = supabase.table("credit_ledger").insert(payload).execute()
    return result.data[0]["id"]


def deduct_credit(
    supabase: Client,
    *,
    billing_account_id: str,
    agent_session_id: str,
) -> str:
    """
    Inserts a -1 credit deduction tied to a specific agent session.
    Returns the new ledger row id.
    """
    result = (
        supabase.table("credit_ledger")
        .insert({
            "billing_account_id": billing_account_id,
            "delta": -1,
            "type": "run_consumed",
            "agent_session_id": agent_session_id,
        })
        .execute()
    )
    return result.data[0]["id"]


# ============================================================
# Model usage
# ============================================================

def insert_model_usage(
    supabase: Client,
    *,
    agent_session_id: str,
    billing_account_id: str,
    user_id: str,
    organization_id: Optional[str],
    provider: str,
    model: str,
    byok: bool = False,
    input_tokens: Optional[int] = None,
    output_tokens: Optional[int] = None,
    cached_input_tokens: Optional[int] = None,
    reasoning_tokens: Optional[int] = None,
    input_token_price_usd: Optional[float] = None,
    output_token_price_usd: Optional[float] = None,
    provider_cost_usd: Optional[float] = None,
) -> str:
    """
    Inserts a model usage record. Best-effort — caller should catch and log
    exceptions rather than letting them fail a run.
    Returns the new model_usage row id.
    """
    result = (
        supabase.table("model_usage")
        .insert({
            "agent_session_id": agent_session_id,
            "billing_account_id": billing_account_id,
            "user_id": user_id,
            "organization_id": organization_id,
            "provider": provider,
            "model": model,
            "byok": byok,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cached_input_tokens": cached_input_tokens,
            "reasoning_tokens": reasoning_tokens,
            "input_token_price_usd": input_token_price_usd,
            "output_token_price_usd": output_token_price_usd,
            "provider_cost_usd": provider_cost_usd,
        })
        .execute()
    )
    return result.data[0]["id"]


def link_model_usage_to_ledger(
    supabase: Client,
    *,
    model_usage_id: str,
    credit_ledger_id: str,
) -> None:
    """Sets credit_ledger_id on a model_usage row after the deduction completes."""
    supabase.table("model_usage").update(
        {"credit_ledger_id": credit_ledger_id}
    ).eq("id", model_usage_id).execute()


def get_plan_id_by_name(
    supabase: Client,
    *,
    name: str,
) -> str | None:
    """Returns the plan UUID for a given plan name (e.g. 'free', 'pro')."""
    result = (
        supabase.table("plans")
        .select("id")
        .eq("name", name)
        .maybe_single()
        .execute()
    )
    return result.data["id"] if result.data else None


def get_plan_by_id(
    supabase: Client,
    *,
    plan_id: str,
) -> "Plan | None":
    """Returns the full Plan row for a given plan UUID."""
    from app.schemas.billing import Plan
    result = (
        supabase.table("plans")
        .select("*")
        .eq("id", plan_id)
        .maybe_single()
        .execute()
    )
    return Plan.model_validate(result.data) if result.data else None


def get_plan_id_by_stripe_price_id(
    supabase: Client,
    *,
    stripe_price_id: str,
) -> str | None:
    """Returns the plan UUID that maps to a given Stripe Price ID."""
    result = (
        supabase.table("plans")
        .select("id")
        .eq("stripe_price_id", stripe_price_id)
        .maybe_single()
        .execute()
    )
    return result.data["id"] if result.data else None
