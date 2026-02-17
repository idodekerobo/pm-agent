import modal

_app: modal.App | None = None


def get_modal_app() -> modal.App:
    """Get or create the singleton Modal App handle."""
    global _app
    if _app is None:
        _app = modal.App.lookup("pm-agent", create_if_missing=True)
    return _app
