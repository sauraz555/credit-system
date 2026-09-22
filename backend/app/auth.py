"""Authentication, Role-Based Access Control (RBAC), and Security Primitives.

This module provides enterprise security controls for the credit bureau platform,
including Argon2id password hashing, RFC 6238 TOTP Multi-Factor Authentication (MFA),
cryptographically signed JSON Web Tokens (JWT) with unique JTI identifiers for revocation,
brute-force account lockout tracking, and declarative FastAPI dependency factories
for strict Role-Based Access Control (RBAC).

Architecture Tier:
    Security & Identity Layer.

Key Dependencies & Callers:
    - Depends on `argon2-cffi`, `python-jose`, `pyotp`, and FastAPI security primitives.
    - Consumed by `routers/auth_router.py` (login/refresh/mfa/logout), all protected routers
      (`admin.py`, `disputes.py`, `ingest.py`, `reports.py`), and test fixtures.

Regulatory & Compliance Context:
    - Privacy Act 1988 (Cth) Part IIIA & Australian Privacy Principle 11:
      Mandates robust authentication and access control to protect credit reporting data
      from unauthorized access, tampering, or disclosure.
"""

import os
import uuid
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple
from argon2 import PasswordHasher
from jose import jwt, JWTError
import pyotp
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, RoleEnum

# REVIEW-SECURITY: Password Hasher using Argon2id (RFC 9106 / OWASP recommended).
# Default parameters provide strong resistance to GPU/ASIC cracking and side-channel timing attacks.
ph = PasswordHasher()


def hash_password(password: str) -> str:
    """Hashes a plaintext password using Argon2id.

    Args:
        password: Raw user password string.

    Returns:
        Argon2id encoded hash string with embedded salt, time cost, and memory cost.

    Example:
        >>> h = hash_password("SecurePassword2026!")
        >>> h.startswith("$argon2id$")
        True
    """
    return ph.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against an Argon2id hash.

    Args:
        plain_password: User-provided plaintext password string.
        hashed_password: Stored Argon2id hash string from database.

    Returns:
        True if password matches hash, False otherwise.
    """
    try:
        return ph.verify(hashed_password, plain_password)
    except Exception:
        return False


# JWT Configuration
# REVIEW-SECURITY: JWT_SECRET_KEY must be stored securely and rotated in production
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "bureau-super-secret-production-jwt-key-2026-auth")
ALGORITHM = "HS256"
# REVIEW-ASSUMPTION: 60-minute access token lifespan balances security and user experience
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
# Refresh tokens valid for 7 days to allow extended operational provider workflows
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

# REVIEW-SECURITY: Set auto_error=False to allow explicit 401 Unauthorized handling
# instead of FastAPI's default 403 Forbidden when credentials are absent.
security = HTTPBearer(auto_error=False)

# REVIEW-SECURITY: In-memory token revocation & reuse detection store.
# For multi-container production deployments, this must be backed by a centralized Redis cluster.
REVOKED_TOKENS = set()
USED_REFRESH_TOKENS = set()

# REVIEW-SECURITY: Brute-force lockout state tracking (email -> {count, locked_until})
FAILED_LOGINS: Dict[str, Dict[str, Any]] = {}
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION = timedelta(minutes=15)


def revoke_token(token_or_jti: str) -> None:
    """Revokes a JWT token or JTI identifier, rendering it immediately invalid.

    Args:
        token_or_jti: JWT JTI claim or raw token string to blacklist.
    """
    if not token_or_jti:
        return
    REVOKED_TOKENS.add(token_or_jti)


def is_token_revoked(token_or_jti: str) -> bool:
    """Checks whether a token JTI or raw token has been blacklisted.

    Args:
        token_or_jti: JWT JTI claim or token string.

    Returns:
        True if token has been revoked, False otherwise.
    """
    if not token_or_jti:
        return False
    return token_or_jti in REVOKED_TOKENS


def is_refresh_token_used(jti: str) -> bool:
    """Checks if a refresh token JTI has already been rotated or consumed.

    Part of refresh token rotation (RFC 6749 Section 10.4): if an already-consumed
    refresh token is presented again, token theft is suspected.

    Args:
        jti: Unique JWT ID claim of the refresh token.

    Returns:
        True if token was previously used, False otherwise.
    """
    if not jti:
        return False
    return jti in USED_REFRESH_TOKENS


def mark_refresh_token_used(jti: str) -> None:
    """Marks a refresh token JTI as used to prevent replay attacks.

    Args:
        jti: Unique JWT ID claim.
    """
    if jti:
        USED_REFRESH_TOKENS.add(jti)
        REVOKED_TOKENS.add(jti)


def record_failed_login(email: str) -> Tuple[int, bool]:
    """Records a failed login attempt and checks for brute-force account lockout.

    Enforces account lockout for 15 minutes after 5 consecutive failed attempts.

    Args:
        email: User email address attempted.

    Returns:
        Tuple of (current_failed_count, is_currently_locked).
    """
    email_key = email.strip().lower()
    now = datetime.utcnow()
    state = FAILED_LOGINS.get(email_key, {"count": 0, "locked_until": None})
    
    # Reset counter if previous lockout expired
    if state["locked_until"] and now > state["locked_until"]:
        state = {"count": 0, "locked_until": None}
        
    state["count"] += 1
    is_locked = False
    if state["count"] >= MAX_FAILED_ATTEMPTS:
        state["locked_until"] = now + LOCKOUT_DURATION
        # If this attempt was already beyond max attempts, mark as locked
        if state["count"] > MAX_FAILED_ATTEMPTS:
            is_locked = True
        
    FAILED_LOGINS[email_key] = state
    return state["count"], is_locked


def is_account_locked(email: str) -> bool:
    """Checks if an account is currently locked out due to excessive failed attempts.

    Args:
        email: Target user email address.

    Returns:
        True if the account is in an active lockout period, False otherwise.
    """
    email_key = email.strip().lower()
    state = FAILED_LOGINS.get(email_key)
    if not state or not state.get("locked_until"):
        return False
    if datetime.utcnow() < state["locked_until"]:
        return True
    return False


def reset_failed_logins(email: str) -> None:
    """Resets failed login attempts upon successful authentication.

    Args:
        email: User email address to clear from the failure tracking map.
    """
    email_key = email.strip().lower()
    if email_key in FAILED_LOGINS:
        del FAILED_LOGINS[email_key]


def clear_lockouts_and_revocations() -> None:
    """Test helper to reset lockout and revocation states across test runs."""
    REVOKED_TOKENS.clear()
    USED_REFRESH_TOKENS.clear()
    FAILED_LOGINS.clear()


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Generates a cryptographically signed JWT access token with unique JTI.

    Args:
        data: Dictionary of claims to encode in the token payload.
        expires_delta: Optional custom duration; defaults to ACCESS_TOKEN_EXPIRE_MINUTES.

    Returns:
        Encoded HS256 JWT string.
    """
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    # REVIEW-SECURITY: JTI (JWT ID) ensures each issued token is uniquely identifiable for revocation
    jti = to_encode.get("jti") or str(uuid.uuid4())
    to_encode.update({"exp": expire, "token_type": "access", "jti": jti})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict) -> str:
    """Generates a cryptographically signed JWT refresh token with unique JTI.

    Args:
        data: Dictionary of claims to encode in the token payload.

    Returns:
        Encoded HS256 JWT string with 7-day expiration.
    """
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    jti = to_encode.get("jti") or str(uuid.uuid4())
    to_encode.update({"exp": expire, "token_type": "refresh", "jti": jti})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Decodes and validates a JWT token, checking cryptographic signature and revocation.

    Args:
        token: Raw JWT string.

    Returns:
        Decoded payload dictionary if valid.

    Raises:
        HTTPException(401): If token is expired, tampered with, or revoked.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        jti = payload.get("jti")
        # REVIEW-SECURITY: Explicit revocation check against blacklisted tokens
        if jti and is_token_revoked(jti):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked",
                headers={"WWW-Authenticate": "Bearer"}
            )
        if is_token_revoked(token):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked",
                headers={"WWW-Authenticate": "Bearer"}
            )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"}
        )


def generate_totp_secret() -> str:
    """Generates a random Base32 TOTP secret for RFC 6238 MFA enrollment.

    Returns:
        Base32 encoded random secret string (160 bits).
    """
    return pyotp.random_base32()


def verify_totp(secret: str, code: str) -> bool:
    """Verifies a 6-digit TOTP code against a user's base32 secret.

    Args:
        secret: Base32 encoded TOTP secret key.
        code: 6-digit numeric string entered by the user.

    Returns:
        True if code is valid within the current or adjacent 30-second window, False otherwise.
    """
    if not secret or not code:
        return False
    totp = pyotp.TOTP(secret)
    # REVIEW-ASSUMPTION: valid_window=1 allows +-30 seconds of client/server clock drift
    return totp.verify(code, valid_window=1)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """FastAPI Dependency: authenticates Bearer token, verifies MFA status, and loads User.

    Args:
        credentials: Authorization header credentials extracted via HTTPBearer.
        db: Scoped database session.

    Returns:
        Authenticated User SQLAlchemy model instance.

    Raises:
        HTTPException(401): If Bearer token is missing, expired, revoked, or an intermediate MFA token.
    """
    # Enforce 401 Unauthorized when credentials are not supplied
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated: Bearer token required",
            headers={"WWW-Authenticate": "Bearer"}
        )
    token = credentials.credentials
    payload = decode_token(token)
    
    # REVIEW-SECURITY: Enforce MFA boundary: Temporary tokens issued for MFA step cannot access protected endpoints
    if payload.get("mfa_pending"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="MFA authentication required: Temporary token cannot access protected resources",
            headers={"WWW-Authenticate": "Bearer"}
        )
        
    # REVIEW-SECURITY: Enforce token type to prevent refresh tokens from being passed as access tokens
    if payload.get("token_type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type: Access token required",
            headers={"WWW-Authenticate": "Bearer"}
        )

    user_id = payload.get("sub")
    email = payload.get("email")
    if not user_id and not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    
    user = None
    if user_id:
        user = db.query(User).filter(User.id == user_id).first()
    if not user and email:
        user = db.query(User).filter(User.email == email).first()
    if not user and user_id:
        user = db.query(User).filter(User.email == user_id).first()
        
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or deactivated")
    return user


def require_roles(*allowed_roles: RoleEnum):
    """FastAPI Dependency Factory: enforces Role-Based Access Control (RBAC).

    Args:
        *allowed_roles: Tuple of RoleEnum members permitted to access the decorated route.

    Returns:
        Callable dependency that validates `current_user.role in allowed_roles`.

    Raises:
        HTTPException(403): If the authenticated user's role is not in `allowed_roles`.
    """
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: Role '{current_user.role}' lacks permission. Required: {[r.value for r in allowed_roles]}"
            )
        return current_user
    return role_checker
