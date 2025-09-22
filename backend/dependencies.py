from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from firebase_admin import auth
import logging

# Set up logging
logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    """
    Dependency to verify Firebase ID token.
    This function will be imported and used by all protected endpoints.
    """
    try:
        # Log the token (first 10 chars) for debugging
        logger.debug(f"Verifying token: {token[:10]}...")
        
        # Verify the token against the Firebase Auth API.
        try:
            decoded_token = auth.verify_id_token(token)
            
            # Log successful verification
            logger.debug(f"Token verified for user: {decoded_token.get('uid')}")
            
            # Check if orgId is in the claims
            if "orgId" not in decoded_token:
                logger.error(f"No orgId in token for user: {decoded_token.get('uid')}")
                raise HTTPException(
                    status_code=400,
                    detail="No organization ID found in user claims",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            
            return decoded_token
        except ValueError as ve:
            # Specific error for token format issues
            logger.error(f"Token format error: {str(ve)}")
            raise HTTPException(
                status_code=401,
                detail=f"Invalid token format: {str(ve)}",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except auth.InvalidIdTokenError as ie:
            # Specific error for invalid tokens
            logger.error(f"Invalid ID token: {str(ie)}")
            raise HTTPException(
                status_code=401,
                detail=f"Invalid ID token: {str(ie)}",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except auth.ExpiredIdTokenError as ee:
            # Specific error for expired tokens
            logger.error(f"Expired ID token: {str(ee)}")
            raise HTTPException(
                status_code=401,
                detail="ID token has expired. Please login again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except auth.RevokedIdTokenError as re:
            # Specific error for revoked tokens
            logger.error(f"Revoked ID token: {str(re)}")
            raise HTTPException(
                status_code=401,
                detail="ID token has been revoked. Please login again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except Exception as e:
        # Log the error
        logger.error(f"Token verification error: {str(e)}")
        
        # If the token is invalid, raise an exception.
        raise HTTPException(
            status_code=401,
            detail=f"Invalid authentication credentials: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def get_current_user_basic(token: str = Depends(oauth2_scheme)):
    """
    Verify Firebase ID token without enforcing orgId claim.
    Use this for endpoints that establish org membership (e.g., accepting an invite)
    before custom claims are populated.
    """
    try:
        logger.debug(f"Verifying token (basic): {token[:10]}...")
        decoded_token = auth.verify_id_token(token)
        logger.debug(f"Basic token verified for user: {decoded_token.get('uid')}")
        return decoded_token
    except Exception as e:
        logger.error(f"Basic token verification error: {str(e)}")
        raise HTTPException(
            status_code=401,
            detail=f"Invalid authentication credentials: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )
