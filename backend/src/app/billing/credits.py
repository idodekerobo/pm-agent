"""Credit enforcement helpers: balance check."""

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
