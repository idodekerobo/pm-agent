from cryptography.fernet import Fernet
from app.config import settings

_fernet = Fernet(settings.oauth_encryption_key.encode())

def encrypt_token(token: str) -> str:
    """Encrypt a plain-text OAuth token before DB storage."""
    return _fernet.encrypt(token.encode()).decode()

def decrypt_token(encrypted: str) -> str:
    """Decrypt a stored token for use in API/CLI calls."""
    return _fernet.decrypt(encrypted.encode()).decode()