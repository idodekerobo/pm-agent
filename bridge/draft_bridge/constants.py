BRIDGE_PORT = 7349          # main server port (C2)
CALLBACK_PORT = 7350        # temporary auth callback listener port
CALLBACK_PATH = "/auth/callback"
WEB_APP_BASE_URL = "https://draftai.us"
BRIDGE_AUTH_URL = f"{WEB_APP_BASE_URL}/auth/bridge"  # web app auth page, follows /auth/* convention
KEYCHAIN_SERVICE = "draft-bridge"
KEYCHAIN_USERNAME = "bridge_token"
AUTH_TIMEOUT_SECONDS = 120
