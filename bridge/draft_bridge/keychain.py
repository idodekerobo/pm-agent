"""Thin wrapper around the keyring library.

All keychain access in draft_bridge goes through these three functions.
Never call keyring directly elsewhere.
"""

import keyring
import keyring.errors

from draft_bridge.constants import KEYCHAIN_SERVICE, KEYCHAIN_USERNAME


def store_token(raw_token: str) -> None:
    keyring.set_password(KEYCHAIN_SERVICE, KEYCHAIN_USERNAME, raw_token)


def load_token() -> str | None:
    return keyring.get_password(KEYCHAIN_SERVICE, KEYCHAIN_USERNAME)


def delete_token() -> None:
    try:
        keyring.delete_password(KEYCHAIN_SERVICE, KEYCHAIN_USERNAME)
    except keyring.errors.PasswordDeleteError:
        pass
