"""Billing routes: status, Stripe Checkout, Stripe Customer Portal."""

import stripe
from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import auth_protect_route
from app.billing import get_billing_account_and_balance
from app.config import settings  # needed for client_app_base_url (success/cancel/return URLs)
from app.db.billing import (
    get_active_subscription,
    get_plan_by_id,
    get_plan_id_by_name,
    update_billing_account_stripe_customer,
)
from app.db.supabase_client import get_supabase
from app.schemas.billing import BillingStatus, CheckoutResponse, PortalResponse

router = APIRouter(prefix="/billing")


@router.get("/status", response_model=BillingStatus)
async def billing_status(user_id: str = Depends(auth_protect_route)):
    supabase = get_supabase()

    billing_account, balance = get_billing_account_and_balance(supabase, user_id=user_id)
    if not billing_account:
        raise HTTPException(status_code=404, detail="No billing account found.")

    subscription = get_active_subscription(
        supabase, billing_account_id=str(billing_account.id)
    )
    if not subscription:
        raise HTTPException(status_code=404, detail="No active subscription found.")

    plan = get_plan_by_id(supabase, plan_id=str(subscription.plan_id))
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found.")

    return BillingStatus(
        plan_name=plan.name,
        credits_remaining=balance,
        current_period_end=subscription.current_period_end,
    )


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(user_id: str = Depends(auth_protect_route)):
    """
    Creates a Stripe Checkout Session for the Pro plan.
    If the user has no Stripe Customer yet, one is created and linked first.
    """
    supabase = get_supabase()
    billing_account, _ = get_billing_account_and_balance(supabase, user_id=user_id)
    if not billing_account:
        raise HTTPException(status_code=404, detail="No billing account found.")

    # Get or create Stripe Customer
    stripe_customer_id = (
        str(billing_account.stripe_customer_id)
        if billing_account.stripe_customer_id
        else None
    )
    if not stripe_customer_id:
        user_row = (
            supabase.table("users")
            .select("email")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        email = user_row.data.get("email") if user_row.data else None
        customer = stripe.Customer.create(email=email)
        stripe_customer_id = customer.id
        update_billing_account_stripe_customer(
            supabase,
            billing_account_id=str(billing_account.id),
            stripe_customer_id=stripe_customer_id,
        )

    # Look up the pro plan's Stripe Price ID from the DB (single source of truth)
    pro_plan_id = get_plan_id_by_name(supabase, name="pro")
    pro_plan = get_plan_by_id(supabase, plan_id=pro_plan_id) if pro_plan_id else None
    if not pro_plan or not pro_plan.stripe_price_id:
        raise HTTPException(status_code=500, detail="Pro plan not configured.")

    session = stripe.checkout.Session.create(
        customer=stripe_customer_id,
        payment_method_types=["card"],
        line_items=[{"price": pro_plan.stripe_price_id, "quantity": 1}],
        mode="subscription",
        success_url=f"{settings.client_app_base_url}/settings?billing=success",
        cancel_url=f"{settings.client_app_base_url}/settings?billing=canceled",
    )

    return CheckoutResponse(checkout_url=session.url)


@router.post("/portal", response_model=PortalResponse)
async def create_portal(user_id: str = Depends(auth_protect_route)):
    """
    Creates a Stripe Customer Portal session so the user can manage
    their subscription, update payment methods, and view invoices.
    """
    supabase = get_supabase()
    billing_account, _ = get_billing_account_and_balance(supabase, user_id=user_id)
    if not billing_account or not billing_account.stripe_customer_id:
        raise HTTPException(
            status_code=400,
            detail="No Stripe customer found. Please upgrade first.",
        )

    session = stripe.billing_portal.Session.create(
        customer=str(billing_account.stripe_customer_id),
        return_url=f"{settings.client_app_base_url}/settings",
    )

    return PortalResponse(portal_url=session.url)
