from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any

from app.database import get_db
from app.models import User, RoleEnum
from app.auth import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
    generate_totp_secret, verify_totp,
    get_current_user,
    record_failed_login, is_account_locked, reset_failed_logins,
    is_refresh_token_used, mark_refresh_token_used, is_token_revoked, revoke_token
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

class RegisterRequest(BaseModel):
    email: str
    password: str
    role: RoleEnum = RoleEnum.SUBJECT
    tenant_id: Optional[str] = None
    entity_id: Optional[str] = None

class LoginRequest(BaseModel):
    email: str
    password: str

class MFAVerifyRequest(BaseModel):
    temp_token: Optional[str] = None
    mfa_token: Optional[str] = None
    code: Optional[str] = None
    totp_code: Optional[str] = None

class RefreshRequest(BaseModel):
    refresh_token: str

class LogoutRequest(BaseModel):
    refresh_token: Optional[str] = None

@router.post("/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    totp_secret = generate_totp_secret() if req.role in [RoleEnum.ADMIN, RoleEnum.ANALYST, RoleEnum.PROVIDER] else None
    
    user = User(
        email=req.email,
        password_hash=hash_password(req.password),
        role=req.role,
        tenant_id=req.tenant_id,
        entity_id=req.entity_id,
        totp_secret=totp_secret,
        mfa_enabled=True if totp_secret else False
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return {
        "status": "success",
        "user_id": user.id,
        "email": user.email,
        "role": user.role,
        "mfa_required": user.mfa_enabled,
        "totp_secret": totp_secret # Expose only upon registration so user can scan authenticator
    }

@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    # 1. Check brute-force lockout status
    if is_account_locked(req.email):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Account is temporarily locked due to multiple failed login attempts. Please try again later."
        )
        
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.password_hash):
        count, is_locked = record_failed_login(req.email)
        if is_locked:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Account is temporarily locked due to multiple failed login attempts. Please try again later."
            )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    
    # 2. Reset lockout on successful credentials
    reset_failed_logins(req.email)
    
    # 3. Check if role requires TOTP MFA (Admin, Analyst, Provider)
    if user.role in [RoleEnum.ADMIN, RoleEnum.ANALYST, RoleEnum.PROVIDER] and user.mfa_enabled and user.totp_secret:
        # Issue a temporary token valid strictly for MFA verification
        temp_token = create_access_token(
            {"sub": user.id, "email": user.email, "role": user.role, "mfa_pending": True},
            expires_delta=None
        )
        return {
            "mfa_required": True,
            "temp_token": temp_token,
            "mfa_token": temp_token,
            "user": {
                "id": user.id,
                "email": user.email,
                "role": user.role,
                "tenant_id": user.tenant_id,
                "entity_id": user.entity_id
            },
            "message": "TOTP MFA code required."
        }
    
    # 4. Otherwise, issue full tokens
    access_token = create_access_token({
        "sub": user.id,
        "email": user.email,
        "role": user.role,
        "tenant_id": user.tenant_id,
        "entity_id": user.entity_id
    })
    refresh_token = create_refresh_token({"sub": user.id})
    
    return {
        "mfa_required": False,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "tenant_id": user.tenant_id,
            "entity_id": user.entity_id
        }
    }

@router.post("/mfa/verify")
def verify_mfa(req: MFAVerifyRequest, db: Session = Depends(get_db)):
    token = req.mfa_token or req.temp_token
    code = req.totp_code or req.code
    if not token or not code:
        raise HTTPException(status_code=400, detail="MFA token and verification code are required")
        
    payload = decode_token(token)
    if not payload.get("mfa_pending"):
        raise HTTPException(status_code=400, detail="Invalid MFA token: Missing mfa_pending claim")
    
    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if not verify_totp(user.totp_secret, code):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid TOTP authentication code")
        
    access_token = create_access_token({
        "sub": user.id,
        "email": user.email,
        "role": user.role,
        "tenant_id": user.tenant_id,
        "entity_id": user.entity_id
    })
    refresh_token = create_refresh_token({"sub": user.id})
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "tenant_id": user.tenant_id,
            "entity_id": user.entity_id
        }
    }

@router.post("/refresh")
def refresh(req: RefreshRequest, db: Session = Depends(get_db)):
    payload = decode_token(req.refresh_token)
    if payload.get("token_type") != "refresh":
        raise HTTPException(status_code=400, detail="Token is not a refresh token")
        
    jti = payload.get("jti")
    if is_refresh_token_used(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token reuse detected: Token has already been rotated"
        )
    if is_token_revoked(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked"
        )
        
    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Rotate: invalidate old refresh token
    mark_refresh_token_used(jti)
    
    new_access_token = create_access_token({
        "sub": user.id,
        "email": user.email,
        "role": user.role,
        "tenant_id": user.tenant_id,
        "entity_id": user.entity_id
    })
    new_refresh_token = create_refresh_token({"sub": user.id})
    
    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token
    }

@router.post("/logout")
def logout(
    req: Optional[LogoutRequest] = None,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Invalidate current refresh token and bearer access token."""
    if authorization and authorization.startswith("Bearer "):
        access_token = authorization.split(" ")[1].strip()
        try:
            payload = decode_token(access_token)
            jti = payload.get("jti")
            if jti:
                revoke_token(jti)
            revoke_token(access_token)
        except Exception:
            revoke_token(access_token)

    if req and req.refresh_token:
        try:
            payload = decode_token(req.refresh_token)
            jti = payload.get("jti")
            if jti:
                revoke_token(jti)
            revoke_token(req.refresh_token)
        except Exception:
            revoke_token(req.refresh_token)

    return {"status": "success", "message": "Successfully logged out. Tokens invalidated."}

@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role,
        "tenant_id": current_user.tenant_id,
        "entity_id": current_user.entity_id
    }
