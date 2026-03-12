"""Stripe webhook receiver."""

from datetime import datetime, timezone

import stripe
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.config import settings
from app.db.billing import (
    get_billing_account_by_stripe_customer_id,
    get_active_subscription,
    get_plan_by_id,
    get_plan_id_by_name,
    get_plan_id_by_stripe_price_id,
    grant_credits,
    upsert_subscription,
    expire_signup_credits,
)
from app.db.supabase_client import get_supabase

router = APIRouter(prefix="/stripe")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

@router.post("")
async def stripe_webhook(request: Request):
    body = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(
            body, sig_header, settings.stripe_webhook_secret
        )
    except (ValueError, stripe.error.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Invalid Stripe signature.")

    handlers = {
        "checkout.session.completed": _handle_checkout_completed,
        "customer.subscription.updated": _handle_subscription_updated,
        "customer.subscription.deleted": _handle_subscription_deleted,
        "invoice.paid": _handle_invoice_paid,
    }
    handler = handlers.get(event["type"])
    if handler:
        supabase = get_supabase()
        await handler(supabase, event["data"]["object"])

    return JSONResponse({"ok": True})


# ---------------------------------------------------------------------------
# Event handlers
# ---------------------------------------------------------------------------

async def _handle_checkout_completed(supabase, session: dict) -> None:
    """
    Fired when a user completes Stripe Checkout.
    Links the new stripe_subscription_id to the billing account and upgrades
    the subscription row to the Pro plan. Period dates arrive via the
    subsequent customer.subscription.updated event.
    """
    stripe_customer_id = session.get("customer")
    stripe_subscription_id = session.get("subscription")
    if not stripe_customer_id or not stripe_subscription_id:
        return

    billing_account = get_billing_account_by_stripe_customer_id(
        supabase, stripe_customer_id=stripe_customer_id
    )
    if not billing_account:
        return

    pro_plan_id = get_plan_id_by_name(supabase, name="pro")
    if not pro_plan_id:
        return

    upsert_subscription(
        supabase,
        billing_account_id=str(billing_account.id),
        plan_id=pro_plan_id,
        stripe_subscription_id=stripe_subscription_id,
        status="active",
        period_start=None,  # filled by the subsequent subscription.updated event
        period_end=None,
    )


async def _handle_subscription_updated(supabase, subscription: dict) -> None:
    """
    Fired whenever a subscription's status, plan, or period changes.
    Keeps our subscription row in sync with Stripe.
    """
    stripe_customer_id = subscription.get("customer")
    stripe_subscription_id = subscription.get("id")
    status = subscription.get("status", "active")

    period_start = _ts_to_dt(subscription.get("current_period_start"))
    period_end = _ts_to_dt(subscription.get("current_period_end"))

    billing_account = get_billing_account_by_stripe_customer_id(
        supabase, stripe_customer_id=stripe_customer_id
    )
    if not billing_account:
        return

    # Map Stripe Price → internal plan; fall back to free if unknown
    items = subscription.get("items", {}).get("data", [])
    stripe_price_id = items[0]["price"]["id"] if items else None
    plan_id = (
        get_plan_id_by_stripe_price_id(supabase, stripe_price_id=stripe_price_id)
        if stripe_price_id
        else None
    ) or get_plan_id_by_name(supabase, name="free")

    upsert_subscription(
        supabase,
        billing_account_id=str(billing_account.id),
        plan_id=plan_id,
        stripe_subscription_id=stripe_subscription_id,
        status=status,
        period_start=period_start,
        period_end=period_end,
    )


async def _handle_subscription_deleted(supabase, subscription: dict) -> None:
    """
    Fired when a subscription is fully canceled (at period end or immediately).
    Downgrades the user to the free plan.
    """
    stripe_customer_id = subscription.get("customer")
    billing_account = get_billing_account_by_stripe_customer_id(
        supabase, stripe_customer_id=stripe_customer_id
    )
    if not billing_account:
        return

    free_plan_id = get_plan_id_by_name(supabase, name="free")
    upsert_subscription(
        supabase,
        billing_account_id=str(billing_account.id),
        plan_id=free_plan_id,
        stripe_subscription_id=None,
        status="active",   # user is now actively on the free plan
        period_start=None,
        period_end=None,
    )


async def _handle_invoice_paid(supabase, invoice: dict) -> None:
    """
    Fired when a subscription invoice is paid (i.e. monthly renewal).
    Grants the plan's monthly_credits to the billing account, expiring at period end.
    """
    stripe_customer_id = invoice.get("customer")
    billing_account = get_billing_account_by_stripe_customer_id(
        supabase, stripe_customer_id=stripe_customer_id
    )
    if not billing_account:
        return

    subscription = get_active_subscription(
        supabase, billing_account_id=str(billing_account.id)
    )
    if not subscription:
        return

    plan = get_plan_by_id(supabase, plan_id=str(subscription.plan_id))
    if not plan or plan.monthly_credits <= 0:
        return

    # Period end comes from the invoice line items
    lines = invoice.get("lines", {}).get("data", [])
    period_end_ts = lines[0]["period"]["end"] if lines else None
    expires_at = _ts_to_dt(period_end_ts)

    if invoice.get("billing_reason") == "subscription_create":
        expire_signup_credits(supabase, billing_account_id=str(billing_account.id))

    grant_credits(
        supabase,
        billing_account_id=str(billing_account.id),
        delta=plan.monthly_credits,
        type="subscription_renewal",
        expires_at=expires_at,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ts_to_dt(timestamp: int | None) -> datetime | None:
    """Convert a Unix timestamp (from Stripe) to a UTC datetime."""
    if not timestamp:
        return None
    return datetime.fromtimestamp(timestamp, tz=timezone.utc)
