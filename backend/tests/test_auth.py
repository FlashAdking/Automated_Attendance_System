"""
test_auth.py — Unit tests for JWT middleware (create_access_token / verify_token).
"""

import pytest
import jwt
import time
from datetime import timedelta
from app.middleware.auth import create_access_token, verify_token, SECRET_KEY, ALGORITHM
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials


# ── Token creation ───────────────────────────────────────────────────────────

class TestCreateAccessToken:
    def test_returns_string(self):
        token = create_access_token({"sub": "user@test.com", "role": "admin"})
        assert isinstance(token, str)
        assert len(token) > 20

    def test_payload_encoded_correctly(self):
        token = create_access_token({"sub": "user@test.com", "role": "admin"})
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["sub"] == "user@test.com"
        assert payload["role"] == "admin"
        assert "exp" in payload

    def test_custom_expiry(self):
        token = create_access_token({"sub": "user@test.com"}, expires_delta=timedelta(seconds=5))
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        # exp should be within ~5 seconds from now
        assert payload["exp"] - int(time.time()) <= 6

    def test_default_expiry_is_one_day(self):
        token = create_access_token({"sub": "user@test.com"})
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        remaining = payload["exp"] - int(time.time())
        # Should be close to 86400 seconds (1 day)
        assert 86300 < remaining <= 86400 + 5

    def test_different_data_produces_different_tokens(self):
        t1 = create_access_token({"sub": "a@test.com"})
        t2 = create_access_token({"sub": "b@test.com"})
        assert t1 != t2


# ── Token verification ───────────────────────────────────────────────────────

class TestVerifyToken:
    def _make_creds(self, token: str) -> HTTPAuthorizationCredentials:
        return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    def test_valid_token_returns_payload(self):
        token = create_access_token({"sub": "admin@test.com", "role": "admin"})
        payload = verify_token(self._make_creds(token))
        assert payload["sub"] == "admin@test.com"
        assert payload["role"] == "admin"

    def test_expired_token_raises_401(self):
        token = create_access_token({"sub": "x@test.com"}, expires_delta=timedelta(seconds=-1))
        with pytest.raises(HTTPException) as exc_info:
            verify_token(self._make_creds(token))
        assert exc_info.value.status_code == 401
        assert "expired" in exc_info.value.detail.lower()

    def test_tampered_token_raises_401(self):
        token = create_access_token({"sub": "x@test.com"})
        bad_token = token[:-5] + "XXXXX"
        with pytest.raises(HTTPException) as exc_info:
            verify_token(self._make_creds(bad_token))
        assert exc_info.value.status_code == 401

    def test_garbage_token_raises_401(self):
        with pytest.raises(HTTPException) as exc_info:
            verify_token(self._make_creds("not.a.real.token"))
        assert exc_info.value.status_code == 401

    def test_wrong_secret_token_raises_401(self):
        bad_token = jwt.encode({"sub": "x@test.com"}, "wrong-secret", algorithm=ALGORITHM)
        with pytest.raises(HTTPException) as exc_info:
            verify_token(self._make_creds(bad_token))
        assert exc_info.value.status_code == 401
