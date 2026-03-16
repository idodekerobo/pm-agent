"""Monitoring provider constants and helpers."""

# Providers that support passive monitoring.
# Used by webhook handlers, synthesis jobs, and the monitoring API to determine
# which integrations are eligible for passive context ingestion.
MONITORING_PROVIDERS: set[str] = {"github", "slack", "linear"}
