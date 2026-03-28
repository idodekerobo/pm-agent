BRIDGE_PORT = 7349          # main server port (C2)
CALLBACK_PORT = 7350        # temporary auth callback listener port
CALLBACK_PATH = "/auth/callback"
WEB_APP_BASE_URL = "https://draftai.us"
BRIDGE_AUTH_URL = f"{WEB_APP_BASE_URL}/auth/bridge"  # web app auth page, follows /auth/* convention
KEYCHAIN_SERVICE = "draft-bridge"
KEYCHAIN_USERNAME = "bridge_token"
AUTH_TIMEOUT_SECONDS = 120

# Cloud API — used by bridge to fetch TLS bundle and integration tokens
CLOUD_API_BASE_URL = "https://api.draftai.us"
CLOUD_WS_URL = "wss://api.draftai.us/bridge/ws"   # Slack relay WebSocket

# CORS — origins allowed to call the bridge server
ALLOWED_ORIGINS = [
    WEB_APP_BASE_URL,           # https://draftai.us (prod)
]

# TLS — where bridge writes the cert/key fetched from the cloud
TLS_DIR = "~/.draft/tls"
TLS_CERT_FILENAME = "fullchain.cer"
TLS_KEY_FILENAME = "local.key"
