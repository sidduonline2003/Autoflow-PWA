"""
Authentication Module - Shared Firebase Auth verification
Used by all microservices for token validation and role-based access
"""

import logging
from functools import wraps
from typing import List, Optional, Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from firebase_admin import auth

from .firebase_client import init_firebase

logger = logging.getLogger(__name__)

# OAuth2 scheme for Bearer token authentication
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """
    Verify Firebase ID token and return decoded user claims.
    Enforces that the user has an orgId in their claims.
    
    Returns:
        dict: Decoded token with user info including uid, email, role, orgId
    
    Raises:
        HTTPException: 401 if token is invalid, expired, or revoked
        HTTPException: 400 if user has no organization ID
    """
    init_firebase()
    
    try:
        logger.debug(f"Verifying token: {token[:10]}...")
        
        try:
            decoded_token = auth.verify_id_token(token)
            logger.debug(f"Token verified for user: {decoded_token.get('uid')}")
            
            # Check if orgId is in the claims
            if "orgId" not in decoded_token:
                logger.error(f"No orgId in token for user: {decoded_token.get('uid')}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No organization ID found in user claims",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            
            return decoded_token
            
        except ValueError as ve:
            logger.error(f"Token format error: {str(ve)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token format: {str(ve)}",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except auth.InvalidIdTokenError as ie:
            logger.error(f"Invalid ID token: {str(ie)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid ID token: {str(ie)}",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except auth.ExpiredIdTokenError as ee:
            logger.error(f"Expired ID token: {str(ee)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="ID token has expired. Please login again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except auth.RevokedIdTokenError as re:
            logger.error(f"Revoked ID token: {str(re)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="ID token has been revoked. Please login again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token verification error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication credentials: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user_basic(token: str = Depends(oauth2_scheme)) -> dict:
    """
    Verify Firebase ID token WITHOUT enforcing orgId claim.
    Use this for endpoints that establish org membership (e.g., accepting an invite)
    before custom claims are populated.
    
    Returns:
        dict: Decoded token with user info
    """
    init_firebase()
    
    try:
        logger.debug(f"Verifying token (basic): {token[:10]}...")
        decoded_token = auth.verify_id_token(token)
        logger.debug(f"Basic token verified for user: {decoded_token.get('uid')}")
        return decoded_token
    except Exception as e:
        logger.error(f"Basic token verification error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication credentials: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_role(allowed_roles: List[str]):
    """
    Dependency factory for role-based access control.
    
    Usage:
        @router.post("/admin-only")
        async def admin_endpoint(user: dict = Depends(require_role(["admin"]))):
            ...
    
    Args:
        allowed_roles: List of role names that are allowed to access the endpoint
    
    Returns:
        Dependency function that validates user role
    """
    async def role_checker(current_user: dict = Depends(get_current_user)) -> dict:
        user_role = current_user.get("role", "").lower()
        allowed_lower = [r.lower() for r in allowed_roles]
        
        if user_role not in allowed_lower:
            logger.warning(
                f"Access denied for user {current_user.get('uid')} "
                f"with role '{user_role}'. Required: {allowed_roles}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {', '.join(allowed_roles)}",
            )
        
        return current_user
    
    return role_checker


def require_admin():
    """Shorthand for require_role(['admin'])"""
    return require_role(["admin"])


def require_manager():
    """Shorthand for manager or admin access"""
    return require_role(["admin", "manager"])


def require_editor():
    """Shorthand for editor, manager, or admin access"""
    return require_role(["admin", "manager", "editor", "lead_editor"])


# Helper to extract org_id from user claims
def get_org_id(current_user: dict) -> str:
    """Extract and validate org_id from user claims"""
    org_id = current_user.get("orgId")
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No organization ID found in user claims",
        )
    return org_id
