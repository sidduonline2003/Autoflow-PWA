"""
==============================================================================
🎓 TESTING TUTORIAL - PART 2: INTEGRATION TESTS WITH MOCKED AUTHENTICATION
==============================================================================

Integration tests test your API endpoints, but with MOCKED dependencies:
- Mocked Firebase Auth (no real Firebase calls)
- Mocked Firestore Database (no real database)
- Real FastAPI routing and validation

This is the KEY part - how to test authenticated endpoints without real users!
"""

import pytest
from unittest.mock import Mock, MagicMock, patch, AsyncMock
from fastapi import FastAPI, Depends, HTTPException
from fastapi.testclient import TestClient
from typing import Optional
import datetime


# ==============================================================================
# STEP 1: UNDERSTANDING THE AUTHENTICATION PROBLEM
# ==============================================================================
"""
In your real code, endpoints look like this:

@router.post("/invites")
async def create_invite(
    req: TeamInviteRequest, 
    current_user: dict = Depends(get_current_user)  # <-- This calls Firebase!
):
    ...

The `get_current_user` dependency:
1. Extracts the Bearer token from headers
2. Calls Firebase to verify the token
3. Returns user data (uid, email, role, orgId)

In tests, we DON'T want to call real Firebase. Instead, we MOCK it.
"""


# ==============================================================================
# STEP 2: THE MOCK PATTERN
# ==============================================================================

# Simulated auth dependency (this is what's in shared/auth.py)
async def get_current_user(token: str = None) -> dict:
    """
    In production, this verifies the Firebase token.
    In tests, we'll REPLACE this function with a mock.
    """
    # Real implementation would call:
    # decoded_token = auth.verify_id_token(token)
    # return {"uid": decoded_token["uid"], ...}
    raise NotImplementedError("This should be mocked in tests")


# Example router code
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class InviteRequest(BaseModel):
    email: str
    role: str
    name: str


@router.get("/team/")
async def list_team(current_user: dict = Depends(get_current_user)):
    """List team members - requires authentication"""
    if not current_user.get("orgId"):
        raise HTTPException(status_code=400, detail="No organization found")
    
    # In real code, this would query Firestore
    return {"members": [], "orgId": current_user["orgId"]}


@router.post("/team/invites")
async def create_invite(
    req: InviteRequest,
    current_user: dict = Depends(get_current_user)
):
    """Create invite - requires ADMIN role"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create invites")
    
    # In real code, this would write to Firestore
    return {
        "status": "success",
        "inviteId": "mock-invite-123",
        "orgId": current_user["orgId"]
    }


# ==============================================================================
# STEP 3: CREATING A TEST APP WITH DEPENDENCY OVERRIDE
# ==============================================================================

def create_test_app(mock_user: Optional[dict] = None):
    """
    Create a FastAPI app for testing with mocked authentication.
    
    Args:
        mock_user: The user data to return from the auth dependency.
                   If None, authentication will fail.
    """
    app = FastAPI()
    app.include_router(router)
    
    # OVERRIDE the get_current_user dependency
    async def mock_get_current_user():
        if mock_user is None:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return mock_user
    
    app.dependency_overrides[get_current_user] = mock_get_current_user
    
    return app


# ==============================================================================
# STEP 4: WRITING INTEGRATION TESTS
# ==============================================================================

class TestListTeamEndpoint:
    """Test the GET /team/ endpoint"""
    
    def test_list_team_requires_auth(self):
        """
        Test that unauthenticated requests are rejected.
        We pass mock_user=None to simulate no authentication.
        """
        # Create app with NO authenticated user
        app = create_test_app(mock_user=None)
        client = TestClient(app)
        
        # Make request without auth
        response = client.get("/team/")
        
        # Should be rejected
        assert response.status_code == 401
        assert "authenticated" in response.json()["detail"].lower()
    
    def test_list_team_success(self):
        """Test successful team listing with authenticated user"""
        # Create app with authenticated admin user
        mock_admin = {
            "uid": "user-123",
            "email": "admin@studio.com",
            "role": "admin",
            "orgId": "org-456"
        }
        app = create_test_app(mock_user=mock_admin)
        client = TestClient(app)
        
        # Make authenticated request
        response = client.get("/team/")
        
        # Should succeed
        assert response.status_code == 200
        assert response.json()["orgId"] == "org-456"
    
    def test_list_team_requires_orgid(self):
        """Test that user without orgId gets an error"""
        # User with missing orgId
        mock_user = {
            "uid": "user-123",
            "email": "user@test.com",
            "role": "editor",
            # orgId is missing!
        }
        app = create_test_app(mock_user=mock_user)
        client = TestClient(app)
        
        response = client.get("/team/")
        
        assert response.status_code == 400
        assert "organization" in response.json()["detail"].lower()


class TestCreateInviteEndpoint:
    """Test the POST /team/invites endpoint"""
    
    def test_create_invite_requires_admin(self):
        """Non-admin users should not be able to create invites"""
        # Regular editor (not admin)
        mock_editor = {
            "uid": "user-123",
            "email": "editor@studio.com",
            "role": "editor",  # NOT admin
            "orgId": "org-456"
        }
        app = create_test_app(mock_user=mock_editor)
        client = TestClient(app)
        
        payload = {
            "email": "newuser@example.com",
            "role": "photographer",
            "name": "New User"
        }
        
        response = client.post("/team/invites", json=payload)
        
        # Should be forbidden
        assert response.status_code == 403
        assert "admin" in response.json()["detail"].lower()
    
    def test_create_invite_success_as_admin(self):
        """Admin should be able to create invites"""
        mock_admin = {
            "uid": "admin-123",
            "email": "admin@studio.com",
            "role": "admin",
            "orgId": "org-456"
        }
        app = create_test_app(mock_user=mock_admin)
        client = TestClient(app)
        
        payload = {
            "email": "newuser@example.com",
            "role": "photographer",
            "name": "New User"
        }
        
        response = client.post("/team/invites", json=payload)
        
        # Should succeed
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "inviteId" in data
        assert data["orgId"] == "org-456"
    
    def test_create_invite_validates_input(self):
        """Invalid input should be rejected with 422"""
        mock_admin = {
            "uid": "admin-123",
            "email": "admin@studio.com",
            "role": "admin",
            "orgId": "org-456"
        }
        app = create_test_app(mock_user=mock_admin)
        client = TestClient(app)
        
        # Missing required fields
        payload = {
            "email": "test@example.com"
            # role and name missing
        }
        
        response = client.post("/team/invites", json=payload)
        
        # FastAPI returns 422 for validation errors
        assert response.status_code == 422


# ==============================================================================
# STEP 5: MOCKING FIRESTORE DATABASE
# ==============================================================================

class TestWithMockedFirestore:
    """
    More advanced: mocking the database layer.
    This tests the full endpoint including database operations.
    """
    
    @patch('__main__.router')  # In real tests: patch the actual module path
    def test_create_invite_with_mocked_db(self, mock_router):
        """
        This shows how to mock Firestore operations.
        In your actual tests, you'd patch the get_db function.
        """
        # Example of mocking Firestore document operations
        mock_db = MagicMock()
        mock_collection = MagicMock()
        mock_doc_ref = MagicMock()
        
        # Set up the mock chain: db.collection().document().set()
        mock_db.collection.return_value = mock_collection
        mock_collection.document.return_value = mock_doc_ref
        mock_doc_ref.id = "generated-invite-id"
        
        # Now when code calls:
        # db.collection('organizations', org_id, 'invites').document()
        # It will return our mock_doc_ref


# ==============================================================================
# STEP 6: FIXTURES FOR REUSABLE TEST SETUP
# ==============================================================================

@pytest.fixture
def admin_client():
    """Fixture that provides a test client with admin authentication"""
    mock_admin = {
        "uid": "admin-123",
        "email": "admin@studio.com",
        "role": "admin",
        "orgId": "org-456"
    }
    app = create_test_app(mock_user=mock_admin)
    return TestClient(app)


@pytest.fixture
def editor_client():
    """Fixture that provides a test client with editor authentication"""
    mock_editor = {
        "uid": "editor-123",
        "email": "editor@studio.com",
        "role": "editor",
        "orgId": "org-456"
    }
    app = create_test_app(mock_user=mock_editor)
    return TestClient(app)


@pytest.fixture
def unauthenticated_client():
    """Fixture for unauthenticated requests"""
    app = create_test_app(mock_user=None)
    return TestClient(app)


class TestWithFixtureClients:
    """Using fixtures for cleaner tests"""
    
    def test_admin_can_create_invite(self, admin_client):
        """Using the admin_client fixture"""
        response = admin_client.post("/team/invites", json={
            "email": "new@example.com",
            "role": "editor",
            "name": "New User"
        })
        assert response.status_code == 200
    
    def test_editor_cannot_create_invite(self, editor_client):
        """Using the editor_client fixture"""
        response = editor_client.post("/team/invites", json={
            "email": "new@example.com",
            "role": "editor",
            "name": "New User"
        })
        assert response.status_code == 403
    
    def test_unauthenticated_cannot_list_team(self, unauthenticated_client):
        """Using the unauthenticated_client fixture"""
        response = unauthenticated_client.get("/team/")
        assert response.status_code == 401


# ==============================================================================
# STEP 7: TESTING IDOR (Insecure Direct Object Reference)
# ==============================================================================

class TestIDORPrevention:
    """
    IDOR is when a user can access/modify resources they shouldn't.
    Example: User A accessing User B's data by guessing IDs.
    """
    
    def test_user_cannot_access_other_org(self):
        """
        User from org-123 should not be able to access org-456's data.
        This is a critical security test.
        """
        # User from org-123
        user_org_123 = {
            "uid": "user-1",
            "email": "user@org123.com",
            "role": "admin",
            "orgId": "org-123"
        }
        
        # In a real test, you'd try to access org-456's resources
        # and verify it fails
        app = create_test_app(mock_user=user_org_123)
        client = TestClient(app)
        
        # The endpoint should only return data from org-123
        response = client.get("/team/")
        assert response.json()["orgId"] == "org-123"
        # It should NOT be able to access org-456


# ==============================================================================
# HOW TO RUN THESE TESTS
# ==============================================================================
"""
# Install dependencies first:
pip install pytest pytest-asyncio httpx

# Run this file:
pytest tests/tutorial_02_integration_tests.py -v

# Run with coverage:
pytest tests/tutorial_02_integration_tests.py -v --cov=routers --cov-report=html
"""

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
