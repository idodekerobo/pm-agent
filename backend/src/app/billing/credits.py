"""Credit enforcement helpers: balance check and model usage recording."""

from typing import Optional

from supabase import Client

from app.db.billing import get_billing_account_by_user_id, get_credit_balance
from app.schemas.billing import BillingAccount


def get_billing_account_and_balance(
    supabase: Client,
    *,
    user_id: str,
) -> tuple[BillingAccount | None, int]:
    """
    Platform-agnostic: fetches the user's billing account and computes their
    current credit balance. Returns (account, balance).
    Callers are responsible for deciding what to do when balance <= 0
    (raise HTTP 402, post a Slack message, etc.).
    """
    account = get_billing_account_by_user_id(supabase, user_id=user_id)
    if not account:
        return None, 0
    balance = get_credit_balance(supabase, billing_account_id=str(account.id))
    return account, balance


def record_model_usage(
    supabase: Client,
    *,
    billing_account: BillingAccount,
    agent_session_id: str,
    organization_id: Optional[str],
    usage_data: dict,
    ledger_id: Optional[str],
) -> None:
    """
    Best-effort: compute cost from usage_data and insert a model_usage row,
    then link it to the credit ledger row if ledger_id is provided.
    Caller is responsible for catching and logging exceptions.
    """
    from app.billing.pricing import compute_cost
    from app.db.billing import insert_model_usage, link_model_usage_to_ledger

    input_price, output_price, cost = compute_cost(
        usage_data["provider"],
        usage_data["model"],
        usage_data.get("input_tokens") or 0,
        usage_data.get("output_tokens") or 0,
        usage_data.get("cached_input_tokens") or 0,
    )

    usage_id = insert_model_usage(
        supabase,
        agent_session_id=agent_session_id,
        billing_account_id=str(billing_account.id),
        user_id=str(billing_account.user_id),
        organization_id=organization_id,
        provider=usage_data["provider"],
        model=usage_data["model"],
        input_tokens=usage_data.get("input_tokens"),
        output_tokens=usage_data.get("output_tokens"),
        cached_input_tokens=usage_data.get("cached_input_tokens"),
        reasoning_tokens=usage_data.get("reasoning_tokens"),
        input_token_price_usd=input_price,
        output_token_price_usd=output_price,
        provider_cost_usd=cost,
    )

    if ledger_id:
        link_model_usage_to_ledger(supabase, model_usage_id=usage_id, credit_ledger_id=ledger_id)
