"""
Test suite for auth routes (register and login endpoints).
Methodology: Integration testing with Flask test client and in-memory SQLite.
"""
import pytest
from app import create_app
from app.models import db as _db


@pytest.fixture
def client():
    # Pass test_config INTO create_app so the in-memory DB is used
    # before db.init_app(app) and db.create_all() run inside the factory.
    app = create_app(test_config={
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "SQLALCHEMY_TRACK_MODIFICATIONS": False,
    })
    with app.app_context():
        with app.test_client() as c:
            yield c
        _db.session.remove()
        _db.drop_all()


class TestRegister:
    """Auth registration endpoint tests"""

    def test_register_success(self, client):
        """Valid registration returns 201"""
        res = client.post("/auth/register", json={
            "email": "new@gmail.com",
            "username": "newuser",
            "password": "valid-passphrase-2026"
        })
        assert res.status_code == 201
        assert "user" in res.get_json()

    def test_register_missing_fields(self, client):
        """Missing fields returns 400"""
        res = client.post("/auth/register", json={
            "email": "test@gmail.com"
        })
        assert res.status_code == 400

    def test_register_duplicate_email(self, client):
        """Duplicate email is rejected (400 or 409 depending on blueprint)"""
        client.post("/auth/register", json={
            "email": "dup@gmail.com",
            "username": "user1",
            "password": "valid-passphrase-2026"
        })
        res = client.post("/auth/register", json={
            "email": "dup@gmail.com",
            "username": "user2",
            "password": "valid-passphrase-2026"
        })
        # Accept either status — both indicate duplicate email rejection.
        # This keeps the test stable across issue #30 blueprint decision.
        assert res.status_code in (400, 409)

    def test_register_rejects_unknown_email_provider(self, client):
        """Registration requires a configured email provider domain"""
        res = client.post("/auth/register", json={
            "email": "new@unknown-provider.test",
            "username": "unknownprovider",
            "password": "valid-passphrase-2026"
        })
        assert res.status_code == 400

    def test_register_rejects_common_password(self, client):
        """Common blocked passwords are rejected"""
        res = client.post("/auth/register", json={
            "email": "weak@gmail.com",
            "username": "weakuser",
            "password": "password123"
        })
        assert res.status_code == 400


class TestLogin:
    """Auth login endpoint tests"""

    def test_login_success(self, client):
        """Valid login returns 200"""
        client.post("/auth/register", json={
            "email": "login@gmail.com",
            "username": "loginuser",
            "password": "valid-passphrase-2026"
        })
        res = client.post("/auth/login", json={
            "email": "login@gmail.com",
            "password": "valid-passphrase-2026"
        })
        assert res.status_code == 200
        assert res.get_json()["message"] == "Login successful"

    def test_login_wrong_password(self, client):
        """Wrong password returns 401"""
        client.post("/auth/register", json={
            "email": "wrong@gmail.com",
            "username": "wronguser",
            "password": "valid-passphrase-2026"
        })
        res = client.post("/auth/login", json={
            "email": "wrong@gmail.com",
            "password": "badpassword"
        })
        assert res.status_code == 401

    def test_login_missing_fields(self, client):
        """Missing fields returns 400"""
        res = client.post("/auth/login", json={
            "email": "test@gmail.com"
        })
        assert res.status_code == 400

    def test_login_lockout_after_three_failures(self, client):
        """Three failed attempts locks the account briefly"""
        client.post("/auth/register", json={
            "email": "lockme@gmail.com",
            "username": "lockuser",
            "password": "valid-passphrase-2026"
        })
        for _ in range(3):
            client.post("/auth/login", json={
                "email": "lockme@gmail.com",
                "password": "badpassword"
            })

        res = client.post("/auth/login", json={
            "email": "lockme@gmail.com",
            "password": "valid-passphrase-2026"
        })
        assert res.status_code == 423

    def test_login_with_demo_2fa(self, client):
        """2FA-enabled account requires and verifies a code"""
        client.post("/auth/register", json={
            "email": "twofa@gmail.com",
            "username": "twofauser",
            "password": "valid-passphrase-2026",
            "twofa_enabled": True
        })
        login_res = client.post("/auth/login", json={
            "email": "twofa@gmail.com",
            "password": "valid-passphrase-2026"
        })
        login_data = login_res.get_json()
        assert login_res.status_code == 202
        assert login_data["requires_2fa"] is True

        verify_res = client.post("/auth/verify-2fa", json={
            "user_id": login_data["user_id"],
            "code": login_data["demo_2fa_code"]
        })
        assert verify_res.status_code == 200

    def test_password_reset_rejects_reuse(self, client):
        """Reset password cannot reuse a previous password"""
        client.post("/auth/register", json={
            "email": "reset@gmail.com",
            "username": "resetuser",
            "password": "valid-passphrase-2026"
        })
        forgot_res = client.post("/auth/forgot-password", json={
            "email": "reset@gmail.com"
        })
        token = forgot_res.get_json()["demo_reset_token"]
        reset_res = client.post("/auth/reset-password", json={
            "email": "reset@gmail.com",
            "token": token,
            "password": "valid-passphrase-2026"
        })
        assert reset_res.status_code == 400

    def test_google_demo_login_creates_user(self, client):
        """Demo Google login creates a local Google-provider user"""
        res = client.post("/auth/google", json={
            "email": "googledemo@gmail.com"
        })
        assert res.status_code == 200
        assert res.get_json()["user"]["auth_provider"] == "google"


"""
SOURCES:
- pytest fixtures: https://docs.pytest.org/en/stable/how-to/fixtures.html
- Flask test client: https://flask.palletsprojects.com/en/3.0.x/testing/
- Existing test_api.py pattern in this project
"""
