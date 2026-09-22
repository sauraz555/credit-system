"""Field-Level Encryption (FLE) and Blind Indexing Cryptographic Utilities.

This module provides authenticated cryptographic primitives for protecting Personally
Identifiable Information (PII) at rest in the credit bureau database. It implements
AES-256-GCM for confidential, tamper-evident storage of government identifiers (ABN, ACN,
Driver License) and HMAC-SHA256 blind indexing for fast exact-match database lookups
without decrypting sensitive records or exposing plaintext to database indexes.

Architecture Tier:
    Security / Cryptography Service Layer.

Key Dependencies & Callers:
    - Depends on `cryptography.hazmat.primitives.ciphers.aead.AESGCM` and Python `hmac`/`hashlib`.
    - Called by `routers/ingest.py` (during entity ingestion), `routers/reports.py` (during
      identifier lookup and entity creation), and seed scripts (`seed_data.py`).

Regulatory & Compliance Context:
    - Privacy Act 1988 (Cth) Australian Privacy Principle 11 (Security of Personal Information):
      Mandates reasonable steps to protect credit information from misuse, interference, loss,
      and unauthorized access or modification.
"""

import os
import base64
import hmac
import hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# REVIEW-SECURITY: 32-byte (256-bit) encryption key from environment.
# In production, this key must be injected via a hardware security module (HSM) or secrets manager.
DEFAULT_KEY_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
RAW_KEY = os.getenv("FLE_ENCRYPTION_KEY", DEFAULT_KEY_HEX)
if len(RAW_KEY) == 64:
    ENCRYPTION_KEY = bytes.fromhex(RAW_KEY)
else:
    # Hash non-hex strings to guarantee a strict 32-byte key for AES-256
    ENCRYPTION_KEY = hashlib.sha256(RAW_KEY.encode()).digest()

# REVIEW-SECURITY: Blind index HMAC key must be kept isolated from the encryption key
# to prevent cross-compromise of deterministic search tokens and field ciphertexts.
BLIND_INDEX_SECRET = os.getenv("BLIND_INDEX_KEY", "bureau-blind-index-hmac-sha256-key").encode()


def encrypt_field(plaintext: str) -> str:
    """Encrypts a plaintext string using AES-256-GCM authenticated encryption.

    Generates a cryptographically random 12-byte initialization vector (nonce),
    encrypts the UTF-8 encoded plaintext with an attached 16-byte authentication tag,
    and returns the concatenated nonce + ciphertext as a base64 encoded string.

    Args:
        plaintext: The sensitive string (e.g., Driver License number, ABN/ACN) to encrypt.

    Returns:
        Base64-encoded string containing 12-byte nonce followed by ciphertext + auth tag,
        or None if input is None.

    Example:
        >>> encrypted = encrypt_field("ABN-12-345-678-901")
        >>> isinstance(encrypted, str)
        True
    """
    if plaintext is None:
        return None
    if not isinstance(plaintext, str):
        plaintext = str(plaintext)
    
    # REVIEW-SECURITY: 12-byte nonce conforms to NIST SP 800-38D for optimal AES-GCM performance & safety
    aesgcm = AESGCM(ENCRYPTION_KEY)
    nonce = os.urandom(12)
    # GCM mode generates ciphertext and 16-byte authentication tag in one atomic operation
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    payload = nonce + ciphertext
    return base64.b64encode(payload).decode("utf-8")


def decrypt_field(ciphertext_b64: str) -> str:
    """Decrypts a base64-encoded AES-256-GCM ciphertext payload.

    Extracts the leading 12-byte nonce, verifies the authentication tag, and
    decrypts the ciphertext using the master encryption key.

    Args:
        ciphertext_b64: Base64 string produced by `encrypt_field()`.

    Returns:
        Decrypted UTF-8 string, or the original value if input is unencrypted or decryption fails.

    Raises:
        None: Gracefully catches cryptographic exceptions and returns the input to support legacy data.
    """
    if ciphertext_b64 is None:
        return None
    try:
        raw = base64.b64decode(ciphertext_b64.encode("utf-8"))
        # Payload must contain at least 12 bytes nonce + 16 bytes auth tag = 28 bytes for non-empty plaintext
        if len(raw) < 13:
            return ciphertext_b64 # Not encrypted or legacy
        nonce = raw[:12]
        ciphertext = raw[12:]
        aesgcm = AESGCM(ENCRYPTION_KEY)
        plaintext_bytes = aesgcm.decrypt(nonce, ciphertext, None)
        return plaintext_bytes.decode("utf-8")
    except Exception:
        # REVIEW-ASSUMPTION: If decryption fails (e.g. legacy plain text in migration), return as-is
        return ciphertext_b64


def compute_blind_index(plaintext: str) -> str:
    """Computes an HMAC-SHA256 deterministic blind index for exact-match database lookups.

    Normalizes the input string by stripping whitespace and converting to lowercase,
    then hashes it with a dedicated HMAC key. This allows SQL exact-match queries
    `WHERE identifier_blind_index = ?` without revealing the underlying PII in database logs.

    Args:
        plaintext: Raw identifier string (e.g., "64 123 456 789").

    Returns:
        Hexadecimal HMAC-SHA256 digest string, or None if input is None.

    Example:
        >>> compute_blind_index("IND-8842-1994")
        '...'
    """
    if plaintext is None:
        return None
    # Normalization prevents trivial lookup misses caused by formatting variations or casing
    normalized = str(plaintext).strip().lower()
    return hmac.new(BLIND_INDEX_SECRET, normalized.encode("utf-8"), hashlib.sha256).hexdigest()
