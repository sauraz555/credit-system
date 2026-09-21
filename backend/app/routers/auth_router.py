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
    get_current_user
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
    temp_token: str
    code: str

class RefreshRequest(BaseModel):
    refresh_token: str

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
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    
    # Check if role requires TOTP MFA (Admin, Analyst, Provider)
    if user.role in [RoleEnum.ADMIN, RoleEnum.ANALYST, RoleEnum.PROVIDER] and user.mfa_enabled and user.totp_secret:
        # Issue a temporary token valid for 5 minutes strictly for MFA verification
        temp_token = create_access_token(
            {"sub": user.id, "email": user.email, "role": user.role, "mfa_pending": True},
            expires_delta=None
        )
        return {
            "mfa_required": True,
            "temp_token": temp_token,
            "message": "TOTP MFA code required."
        }
    
    # Otherwise, issue full tokens
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
    payload = decode_token(req.temp_token)
    if not payload.get("mfa_pending"):
        raise HTTPException(status_code=400, detail="Invalid MFA token")
    
    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if not verify_totp(user.totp_secret, req.code):
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
        
    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    new_access_token = create_access_token({
        "sub": user.id,
        "email": user.email,
        "role": user.role,
        "tenant_id": user.tenant_id,
        "entity_id": user.entity_id
    })
    return {"access_token": new_access_token}

@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role,
        "tenant_id": current_user.tenant_id,
        "entity_id": current_user.entity_id
    }
