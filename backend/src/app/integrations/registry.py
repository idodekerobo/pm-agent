"""Single source of truth for all integrations available in the app.

Each IntegrationConfig captures what a provider is and what it can do.
Derived constants (MONITORING_PROVIDERS, PROVIDER_SKILL_MAP, etc.) should
eventually be built from this registry rather than defined separately.

TODO: refactor context.py's PROVIDER_SKILL_MAP and monitoring.py's
MONITORING_PROVIDERS to be derived from INTEGRATIONS here so this is the
only place a new integration needs to be registered.
"""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class IntegrationConfig:
    key: str                        # provider identifier used throughout the codebase
    name: str                       # human-readable display name

    # Skills provisioned for this provider (keys match /agents/skills/ directory names)
    skill_keys: tuple[str, ...] = field(default_factory=tuple)

    # Whether the agent can passively monitor this provider for background context
    supports_monitoring: bool = False

    # Whether we receive inbound webhooks from this provider
    has_webhook: bool = False

    # Whether the user supplies their own API key instead of going through OAuth
    is_byok: bool = False

    # Not yet available to users
    coming_soon: bool = False


INTEGRATIONS: tuple[IntegrationConfig, ...] = (
    IntegrationConfig(
        key="github",
        name="GitHub",
        skill_keys=("github",),
        supports_monitoring=True,
        has_webhook=True,
    ),
    IntegrationConfig(
        key="slack",
        name="Slack",
        skill_keys=(),
        supports_monitoring=True,
        has_webhook=True,
    ),
    IntegrationConfig(
        key="linear",
        name="Linear",
        skill_keys=("linear-cli",),
        supports_monitoring=True,
        has_webhook=True,
    ),
    IntegrationConfig(
        key="notion",
        name="Notion",
        skill_keys=("notion",),
        supports_monitoring=False,
        has_webhook=False,
    ),
    IntegrationConfig(
        key="google",
        name="Google Drive",
        skill_keys=("google-drive", "google-docs"),
        supports_monitoring=False,
        has_webhook=False,
        coming_soon=True,
    ),
    IntegrationConfig(
        key="claude-code",
        name="Claude Code",
        skill_keys=("coding-agent",),
        supports_monitoring=False,
        has_webhook=False,
        is_byok=True,
    ),
    IntegrationConfig(
        key="posthog",
        name="PostHog",
        skill_keys=("posthog",),
        supports_monitoring=False,
        has_webhook=False,
        is_byok=True,
    ),
)

# ---------------------------------------------------------------------------
# Derived lookups — convenience accessors built from INTEGRATIONS above.
# These mirror constants currently defined separately in the codebase.
# ---------------------------------------------------------------------------

INTEGRATION_MAP: dict[str, IntegrationConfig] = {i.key: i for i in INTEGRATIONS}

MONITORING_PROVIDERS: frozenset[str] = frozenset(
    i.key for i in INTEGRATIONS if i.supports_monitoring
)

WEBHOOK_PROVIDERS: frozenset[str] = frozenset(
    i.key for i in INTEGRATIONS if i.has_webhook
)

# Maps provider key → list of skill directory names.
# Mirrors PROVIDER_SKILL_MAP in context.py — that constant should eventually
# be replaced with: {i.key: list(i.skill_keys) for i in INTEGRATIONS if i.skill_keys}
PROVIDER_SKILL_MAP: dict[str, list[str]] = {
    i.key: list(i.skill_keys)
    for i in INTEGRATIONS
    if i.skill_keys
}
