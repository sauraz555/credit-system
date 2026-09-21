import os
import base64
import hmac
import hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# 32-byte (256-bit) encryption key from environment
# In production, this is supplied via secure secret management
DEFAULT_KEY_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
RAW_KEY = os.getenv("FLE_ENCRYPTION_KEY", DEFAULT_KEY_HEX)
if len(RAW_KEY) == 64:
    ENCRYPTION_KEY = bytes.fromhex(RAW_KEY)
else:
    ENCRYPTION_KEY = hashlib.sha256(RAW_KEY.encode()).digest()

# Blind index HMAC key
BLIND_INDEX_SECRET = os.getenv("BLIND_INDEX_KEY", "bureau-blind-index-hmac-sha256-key").encode()

def encrypt_field(plaintext: str) -> str:
    """Encrypt a string using AES-256-GCM and return base64 encoded nonce+ciphertext."""
    if plaintext is None:
        return None
    if not isinstance(plaintext, str):
        plaintext = str(plaintext)
    
    aesgcm = AESGCM(ENCRYPTION_KEY)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    payload = nonce + ciphertext
    return base64.b64encode(payload).decode("utf-8")

def decrypt_field(ciphertext_b64: str) -> str:
    """Decrypt a base64 encoded AES-256-GCM payload."""
    if ciphertext_b64 is None:
        return None
    try:
        raw = base64.b64decode(ciphertext_b64.encode("utf-8"))
        if len(raw) < 13:
            return ciphertext_b64 # Not encrypted or legacy
        nonce = raw[:12]
        ciphertext = raw[12:]
        aesgcm = AESGCM(ENCRYPTION_KEY)
        plaintext_bytes = aesgcm.decrypt(nonce, ciphertext, None)
        return plaintext_bytes.decode("utf-8")
    except Exception:
        # If decryption fails (e.g. legacy plain text), return as-is
        return ciphertext_b64

def compute_blind_index(plaintext: str) -> str:
    """Compute an HMAC-SHA256 blind index for exact-match database lookup."""
    if plaintext is None:
        return None
    normalized = str(plaintext).strip().lower()
    return hmac.new(BLIND_INDEX_SECRET, normalized.encode("utf-8"), hashlib.sha256).hexdigest()
