"""
conftest.py — shared fixtures for AttendSnap backend tests.

All MongoDB calls are fully mocked via unittest.mock so no real
database connection is needed.  The FastAPI app is overridden with
dependency-injected mock DB instances before each test.
"""

import os
# ── Set dummy env vars BEFORE any app code is imported ──────────────────────
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "attendsnap_test")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-unit-tests")
os.environ.setdefault("RESEND_API_KEY", "")
os.environ.setdefault("CLOUDINARY_URL", "")

from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi.testclient import TestClient

# ── Patch heavy ML / external libs before importing the app ─────────────────
import sys

# Stub out tensorflow, mtcnn, keras, cloudinary, resend so they don't need
# to be fully initialised during test collection.
for mod in ("tensorflow", "keras", "mtcnn", "cloudinary", "cloudinary.uploader", "resend"):
    if mod not in sys.modules:
        sys.modules[mod] = MagicMock()

# Also stub the face-recognition helpers so no GPU/model required
with patch("app.face_recognition.face_utils.load_models", return_value=None):
    from app.main import app
    from app.database import get_admin_db, get_user_db, get_attendance_db
    from app.middleware.auth import create_access_token


# ── Helpers ─────────────────────────────────────────────────────────────────

def _make_token(email: str = "admin@test.com", role: str = "admin") -> str:
    return create_access_token({"sub": email, "role": role})


def _auth_headers(email: str = "admin@test.com") -> dict:
    return {"Authorization": f"Bearer {_make_token(email)}"}


# ── Mock DB factories ────────────────────────────────────────────────────────

def make_mock_admin_db(admin_doc=None):
    db = MagicMock()
    db.find_admin_by_email = AsyncMock(return_value=admin_doc)
    db.collection = MagicMock()
    db.collection.insert_one = AsyncMock(return_value=MagicMock(inserted_id="mock_id"))
    db.collection.update_one = AsyncMock()
    return db


def make_mock_user_db(user_doc=None, all_users=None):
    db = MagicMock()
    db.find_user_by_prn = AsyncMock(return_value=user_doc)
    db.find_user_by_email = AsyncMock(return_value=None)
    db.find_all_users = AsyncMock(return_value=all_users or [])
    db.get_all_embeddings = AsyncMock(return_value=[])
    db.insert_user = AsyncMock(return_value="new_id")
    db.update_user = AsyncMock()
    db.delete_user = AsyncMock()
    db.mark_attendance = AsyncMock()
    return db


def make_mock_att_db(sessions=None):
    db = MagicMock()
    db.get_all_sessions = AsyncMock(return_value=sessions or [])
    db.get_session_by_id = AsyncMock(return_value=None)
    db.get_session_by_date = AsyncMock(return_value=None)
    db.insert_session = AsyncMock(return_value="session_id_123")
    db.add_student_to_session = AsyncMock()
    db.update_student_status_in_session = AsyncMock()
    db.update_session = AsyncMock()
    db.delete_session = AsyncMock(return_value=True)
    return db


# ── Sample data ──────────────────────────────────────────────────────────────

SAMPLE_ADMIN = {
    "_id": "admin_id_1",
    "name": "Test Admin",
    "email": "admin@test.com",
    # bcrypt hash of "password123"
    "password": "$2b$12$eImiTXuWVxfM37uY4JANjQ.ZfnZ/sNgQEPnBXj1e4rVwzBCWq3ygW",
    "group_photos_user": [],
}

SAMPLE_STUDENT = {
    "_id": "student_id_1",
    "name": "Alice Smith",
    "prn": "PRN001",
    "class": "SE",
    "div": "A",
    "dob": "2002-05-15",
    "contact": "9876543210",
    "email": "alice@college.edu",
    "gender": "Female",
    "image_link": "https://res.cloudinary.com/test/image/upload/test.jpg",
    "image_embeddings": [0.1] * 512,
    "attendance": [
        {"date": "2026-05-01", "status": "present", "method": "ai"},
        {"date": "2026-05-02", "status": "absent", "method": "manual"},
        {"date": "2026-05-03", "status": "present", "method": "ai"},
    ],
}

SAMPLE_SESSION = {
    "_id": "session_id_1",
    "date": "2026-05-20",
    "time_from": "09:00",
    "time_to": "10:00",
    "subject": "Data Structures",
    "marked_by": "admin@test.com",
    "method": "manual",
    "photo_url": None,
    "total_students": 2,
    "present_count": 1,
    "absent_count": 1,
    "students": [
        {"prn": "PRN001", "name": "Alice Smith", "class": "SE", "div": "A", "status": "present"},
        {"prn": "PRN002", "name": "Bob Jones", "class": "SE", "div": "A", "status": "absent"},
    ],
    "note": "",
    "created_at": "2026-05-20T03:30:00+00:00",
}


# ── Client fixture ───────────────────────────────────────────────────────────

@pytest.fixture
def client():
    """Bare TestClient with no DB overrides — override per test."""
    with TestClient(app) as c:
        yield c


@pytest.fixture
def auth_headers():
    return _auth_headers()


@pytest.fixture
def admin_token():
    return _make_token()
