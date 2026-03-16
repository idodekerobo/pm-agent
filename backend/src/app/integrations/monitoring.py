"""Monitoring provider constants.

MONITORING_PROVIDERS is derived from the integration registry.
Import it from here so call sites don't need to know about the registry directly.
"""
from app.integrations.registry import MONITORING_PROVIDERS as MONITORING_PROVIDERS  # re-export

__all__ = ["MONITORING_PROVIDERS"]
