"""Fetch the bridge startup bundle from Draft Cloud and cache TLS to disk.

The bundle includes:
  - TLS cert + key for local.draftai.us  (written to ~/.draft/tls/)
  - Supabase URL + anon key              (stored in memory, used for DB writes)

Always fetches fresh on startup — ensures renewed certs are picked up automatically.
"""

from dataclasses import dataclass
from pathlib import Path

import httpx

from draft_bridge.constants import (
    CLOUD_API_BASE_URL,
    TLS_CERT_FILENAME,
    TLS_DIR,
    TLS_KEY_FILENAME,
)


@dataclass
class StartupBundle:
    cert_path: Path
    key_path: Path
    supabase_url: str
    supabase_anon_key: str


def fetch_and_cache(bridge_token: str) -> StartupBundle:
    """Fetch the startup bundle from cloud and write TLS files to ~/.draft/tls/.

    Returns a StartupBundle with paths to the cert/key files plus Supabase config.
    Raises httpx.HTTPStatusError on auth failure or server error.
    """
    tls_dir = Path(TLS_DIR).expanduser()
    tls_dir.mkdir(parents=True, exist_ok=True)

    resp = httpx.get(
        f"{CLOUD_API_BASE_URL}/bridge/tls-bundle",
        headers={"Authorization": f"Bearer {bridge_token}"},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()

    cert_path = tls_dir / TLS_CERT_FILENAME
    key_path = tls_dir / TLS_KEY_FILENAME

    cert_path.write_text(data["cert"])
    key_path.write_text(data["key"])
    key_path.chmod(0o600)  # private key readable only by owner

    return StartupBundle(
        cert_path=cert_path,
        key_path=key_path,
        supabase_url=data.get("supabase_url", ""),
        supabase_anon_key=data.get("supabase_publishable_key", ""),
    )
