"""
==============================================================================
🎓 TESTING TUTORIAL - PART 1: UNIT TESTS
==============================================================================

Unit tests test individual functions in ISOLATION.
- No database
- No network calls
- No Firebase
- Pure input → output testing

This is where you test your VALIDATION logic, helper functions, etc.
"""

import pytest
import re
from typing import List
from pydantic import BaseModel, Field, field_validator, ValidationError


# ==============================================================================
# STEP 1: THE CODE WE WANT TO TEST
# ==============================================================================

# This is a simplified version of what's in routers/team.py
# In real tests, you'd import from the actual module

class TeamInviteRequest(BaseModel):
    """
    Pydantic model for creating team invites.
    Pydantic automatically validates data when you create an instance.
    """
    email: str = Field(..., min_length=5, max_length=254)
    role: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=100)
    skills: List[str] = Field(default_factory=list)
    
    @field_validator('email')
    @classmethod
    def validate_email(cls, v):
        """Custom validator - runs automatically when 'email' is set"""
        email = v.strip().lower()
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, email):
            raise ValueError("Invalid email format")
        return email
    
    @field_validator('role')
    @classmethod
    def validate_role(cls, v):
        """Whitelist of allowed roles - security feature"""
        allowed_roles = ['admin', 'editor', 'photographer', 'cinematographer', 
                        'data-manager', 'accountant', 'team-member']
        normalized = v.lower().strip().replace('_', '-').replace(' ', '-')
        if normalized not in allowed_roles:
            raise ValueError(f"Invalid role. Allowed: {', '.join(allowed_roles)}")
        return normalized
    
    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v):
        """Remove dangerous characters - XSS prevention"""
        sanitized = re.sub(r'[<>"\'/\\;]', '', v.strip())
        if not sanitized:
            raise ValueError("Name cannot be empty after sanitization")
        return sanitized


# ==============================================================================
# STEP 2: WRITING UNIT TESTS
# ==============================================================================

class TestEmailValidation:
    """
    Group related tests in a class.
    Class name must start with 'Test'.
    Method names must start with 'test_'.
    """
    
    def test_valid_email_passes(self):
        """
        ARRANGE: Set up test data
        ACT: Call the code being tested
        ASSERT: Check the result
        """
        # Arrange
        email = "john@example.com"
        
        # Act
        invite = TeamInviteRequest(
            email=email,
            role="editor",
            name="John Doe",
            skills=[]
        )
        
        # Assert
        assert invite.email == "john@example.com"
    
    def test_email_normalized_to_lowercase(self):
        """Test that EMAIL is case-insensitive"""
        invite = TeamInviteRequest(
            email="JOHN@EXAMPLE.COM",
            role="editor", 
            name="John",
            skills=[]
        )
        
        assert invite.email == "john@example.com"  # Should be lowercase
    
    def test_invalid_email_raises_error(self):
        """
        Use pytest.raises() to test that an exception is raised.
        This is how you test NEGATIVE cases (things that should fail).
        """
        with pytest.raises(ValidationError) as exc_info:
            TeamInviteRequest(
                email="not-an-email",  # Invalid!
                role="editor",
                name="John",
                skills=[]
            )
        
        # exc_info contains the exception details
        assert "email" in str(exc_info.value).lower()
    
    def test_sql_injection_in_email_rejected(self):
        """Security test: SQL injection attempts should be rejected"""
        malicious_emails = [
            "'; DROP TABLE users;--",
            "admin@test.com' OR '1'='1",
            "<script>alert('xss')</script>@evil.com"
        ]
        
        for malicious in malicious_emails:
            with pytest.raises(ValidationError):
                TeamInviteRequest(
                    email=malicious,
                    role="editor",
                    name="Hacker",
                    skills=[]
                )


class TestRoleValidation:
    """Test the role whitelist security feature"""
    
    def test_valid_roles_accepted(self):
        """All legitimate roles should work"""
        valid_roles = ['admin', 'editor', 'photographer', 'team-member']
        
        for role in valid_roles:
            invite = TeamInviteRequest(
                email="test@example.com",
                role=role,
                name="Test User",
                skills=[]
            )
            assert invite.role == role
    
    def test_privilege_escalation_prevented(self):
        """
        SECURITY TEST: Users should not be able to assign
        super-privileged roles that don't exist in our system.
        """
        dangerous_roles = ['superadmin', 'root', 'god', 'system']
        
        for role in dangerous_roles:
            with pytest.raises(ValidationError):
                TeamInviteRequest(
                    email="test@example.com",
                    role=role,
                    name="Attacker",
                    skills=[]
                )


class TestXSSPrevention:
    """Test Cross-Site Scripting prevention in name field"""
    
    def test_script_tags_removed(self):
        """<script> tags should be stripped out"""
        invite = TeamInviteRequest(
            email="test@example.com",
            role="editor",
            name="<script>alert('xss')</script>John",
            skills=[]
        )
        
        assert "<script>" not in invite.name
        assert "John" in invite.name
    
    def test_html_injection_prevented(self):
        """HTML tags should be removed"""
        invite = TeamInviteRequest(
            email="test@example.com",
            role="editor",
            name="<img src=x onerror=alert('xss')>Bob",
            skills=[]
        )
        
        assert "<" not in invite.name
        assert ">" not in invite.name


# ==============================================================================
# STEP 3: TESTING HELPER FUNCTIONS
# ==============================================================================

def normalize_role_for_code(role: str) -> str:
    """Helper function to normalize role for employee codes"""
    normalized = (role or "").strip().upper()
    normalized = re.sub(r"[^A-Z0-9]+", "_", normalized)
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    return normalized or "TEAM"


class TestHelperFunctions:
    """Unit tests for helper functions"""
    
    def test_normalize_role_basic(self):
        assert normalize_role_for_code("admin") == "ADMIN"
        assert normalize_role_for_code("Editor") == "EDITOR"
    
    def test_normalize_role_with_special_chars(self):
        assert normalize_role_for_code("data-manager") == "DATA_MANAGER"
        assert normalize_role_for_code("team member") == "TEAM_MEMBER"
    
    def test_normalize_role_edge_cases(self):
        assert normalize_role_for_code("") == "TEAM"
        assert normalize_role_for_code(None) == "TEAM"
        assert normalize_role_for_code("   ") == "TEAM"


# ==============================================================================
# STEP 4: USING FIXTURES (Reusable Test Setup)
# ==============================================================================

@pytest.fixture
def valid_invite_data():
    """
    A fixture provides reusable test data.
    Use it by adding the fixture name as a function parameter.
    """
    return {
        "email": "test@example.com",
        "role": "editor",
        "name": "Test User",
        "skills": ["photography", "editing"]
    }


@pytest.fixture
def admin_user():
    """Mock admin user data"""
    return {
        "uid": "admin-123",
        "email": "admin@studio.com",
        "role": "admin",
        "orgId": "org-456"
    }


class TestWithFixtures:
    """Examples of using fixtures"""
    
    def test_create_invite_with_fixture(self, valid_invite_data):
        """The fixture is passed as a parameter"""
        invite = TeamInviteRequest(**valid_invite_data)
        
        assert invite.email == "test@example.com"
        assert invite.skills == ["photography", "editing"]
    
    def test_modify_fixture_data(self, valid_invite_data):
        """Fixtures are fresh for each test - modifications are isolated"""
        valid_invite_data["role"] = "photographer"
        
        invite = TeamInviteRequest(**valid_invite_data)
        assert invite.role == "photographer"


# ==============================================================================
# STEP 5: PARAMETERIZED TESTS (Test multiple inputs at once)
# ==============================================================================

@pytest.mark.parametrize("email,expected", [
    ("john@example.com", "john@example.com"),
    ("MARY@TEST.COM", "mary@test.com"),
    ("user+alias@domain.org", "user+alias@domain.org"),
])
def test_email_normalization_parametrized(email, expected):
    """
    Parametrized tests run the same test with different inputs.
    Much cleaner than writing separate tests for each case.
    """
    invite = TeamInviteRequest(
        email=email,
        role="editor",
        name="Test",
        skills=[]
    )
    assert invite.email == expected


@pytest.mark.parametrize("invalid_email", [
    "not-an-email",
    "@nodomain.com",
    "user@",
    "spaces in@email.com",
    "",
])
def test_invalid_emails_rejected(invalid_email):
    """All these invalid emails should raise ValidationError"""
    with pytest.raises(ValidationError):
        TeamInviteRequest(
            email=invalid_email,
            role="editor",
            name="Test",
            skills=[]
        )


# ==============================================================================
# HOW TO RUN THESE TESTS
# ==============================================================================
"""
From the terminal:

# Run all tests in this file
pytest tests/tutorial_01_unit_tests.py -v

# Run a specific test class
pytest tests/tutorial_01_unit_tests.py::TestEmailValidation -v

# Run a specific test
pytest tests/tutorial_01_unit_tests.py::TestEmailValidation::test_valid_email_passes -v

# Run with print output visible
pytest tests/tutorial_01_unit_tests.py -v -s

# Stop on first failure
pytest tests/tutorial_01_unit_tests.py -v -x

# Run tests matching a pattern
pytest tests/tutorial_01_unit_tests.py -v -k "email"
"""

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
