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

# Password Hasher using Argon2
ph = PasswordHasher()

def hash_password(password: str) -> str:
    """Hash password using Argon2id."""
    return ph.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against Argon2 hash."""
    try:
        return ph.verify(hashed_password, plain_password)
    except Exception:
        return False

# JWT Configuration
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "bureau-super-secret-production-jwt-key-2026-auth")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

security = HTTPBearer(auto_error=False)

# Security: In-memory token revocation & reuse detection store
REVOKED_TOKENS = set()
USED_REFRESH_TOKENS = set()

# Security: Brute-force lockout state tracking (email -> {count, locked_until})
FAILED_LOGINS: Dict[str, Dict[str, Any]] = {}
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION = timedelta(minutes=15)

def revoke_token(token_or_jti: str) -> None:
    """Revoke a token JTI or full token string."""
    if not token_or_jti:
        return
    REVOKED_TOKENS.add(token_or_jti)

def is_token_revoked(token_or_jti: str) -> bool:
    """Check if token JTI or raw token has been revoked."""
    if not token_or_jti:
        return False
    return token_or_jti in REVOKED_TOKENS

def is_refresh_token_used(jti: str) -> bool:
    """Check if a refresh token JTI has already been rotated/used."""
    if not jti:
        return False
    return jti in USED_REFRESH_TOKENS

def mark_refresh_token_used(jti: str) -> None:
    """Mark a refresh token JTI as used to prevent replay."""
    if jti:
        USED_REFRESH_TOKENS.add(jti)
        REVOKED_TOKENS.add(jti)

def record_failed_login(email: str) -> Tuple[int, bool]:
    """Record a failed login attempt and check for lockout."""
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
    """Check if an account is currently locked out."""
    email_key = email.strip().lower()
    state = FAILED_LOGINS.get(email_key)
    if not state or not state.get("locked_until"):
        return False
    if datetime.utcnow() < state["locked_until"]:
        return True
    return False

def reset_failed_logins(email: str) -> None:
    """Reset failed attempts upon successful authentication."""
    email_key = email.strip().lower()
    if email_key in FAILED_LOGINS:
        del FAILED_LOGINS[email_key]

def clear_lockouts_and_revocations() -> None:
    """Test helper to reset lockout and revocation states."""
    REVOKED_TOKENS.clear()
    USED_REFRESH_TOKENS.clear()
    FAILED_LOGINS.clear()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Generate a signed JWT access token with JTI."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    jti = to_encode.get("jti") or str(uuid.uuid4())
    to_encode.update({"exp": expire, "token_type": "access", "jti": jti})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token(data: dict) -> str:
    """Generate a signed JWT refresh token with unique JTI."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    jti = to_encode.get("jti") or str(uuid.uuid4())
    to_encode.update({"exp": expire, "token_type": "refresh", "jti": jti})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    """Decode and validate a JWT token, verifying expiry and revocation."""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        jti = payload.get("jti")
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

# TOTP MFA helpers
def generate_totp_secret() -> str:
    return pyotp.random_base32()

def verify_totp(secret: str, code: str) -> bool:
    if not secret or not code:
        return False
    totp = pyotp.TOTP(secret)
    # Allows small window drift (valid for current and previous 30s period)
    return totp.verify(code, valid_window=1)

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """FastAPI Dependency: authenticate token, verify MFA completion, and load User."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated: Bearer token required",
            headers={"WWW-Authenticate": "Bearer"}
        )
    token = credentials.credentials
    payload = decode_token(token)
    
    # Enforce MFA boundary: Temporary tokens issued for MFA step cannot access protected endpoints
    if payload.get("mfa_pending"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="MFA authentication required: Temporary token cannot access protected resources",
            headers={"WWW-Authenticate": "Bearer"}
        )
        
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
    """FastAPI Dependency Factory: enforce Role-Based Access Control."""
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: Role '{current_user.role}' lacks permission. Required: {[r.value for r in allowed_roles]}"
            )
        return current_user
    return role_checker
