"""
test_admin_routes.py — Integration tests for /api/admin/* endpoints.

All MongoDB, Cloudinary, and email calls are mocked.
The FastAPI dependency-injection system is overridden per test so
the real DB is never touched.
"""

import pytest
import bcrypt
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

from tests.conftest import (
    SAMPLE_ADMIN, SAMPLE_STUDENT, SAMPLE_SESSION,
    make_mock_admin_db, make_mock_user_db, make_mock_att_db,
    _auth_headers,
)
from app.main import app
from app.database import get_admin_db, get_user_db, get_attendance_db


# ── Helpers ──────────────────────────────────────────────────────────────────

def _override(admin_db=None, user_db=None, att_db=None):
    """Apply dependency overrides and return reset callable."""
    if admin_db:
        app.dependency_overrides[get_admin_db] = lambda: admin_db
    if user_db:
        app.dependency_overrides[get_user_db] = lambda: user_db
    if att_db:
        app.dependency_overrides[get_attendance_db] = lambda: att_db


def _reset():
    app.dependency_overrides.clear()


# ═══════════════════════════════════════════════════════════════════════════════
#  AUTH ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestAdminLogin:
    def setup_method(self):
        _reset()

    def test_login_success(self, client):
        # bcrypt hash of "password123"
        hashed = bcrypt.hashpw(b"password123", bcrypt.gensalt()).decode()
        admin_doc = {**SAMPLE_ADMIN, "password": hashed}
        _override(admin_db=make_mock_admin_db(admin_doc))

        res = client.post("/api/admin/login", json={"email": "admin@test.com", "password": "password123"})
        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, client):
        hashed = bcrypt.hashpw(b"correct_pass", bcrypt.gensalt()).decode()
        admin_doc = {**SAMPLE_ADMIN, "password": hashed}
        _override(admin_db=make_mock_admin_db(admin_doc))

        res = client.post("/api/admin/login", json={"email": "admin@test.com", "password": "wrong_pass"})
        assert res.status_code == 401
        assert "Incorrect" in res.json()["detail"]

    def test_login_unknown_email(self, client):
        _override(admin_db=make_mock_admin_db(None))  # no admin found

        res = client.post("/api/admin/login", json={"email": "nobody@test.com", "password": "any"})
        assert res.status_code == 401

    def test_login_missing_fields(self, client):
        _override(admin_db=make_mock_admin_db(None))
        res = client.post("/api/admin/login", json={"email": "admin@test.com"})
        assert res.status_code == 422  # Pydantic validation error


class TestAdminRegister:
    def setup_method(self):
        _reset()

    def test_register_success(self, client):
        _override(admin_db=make_mock_admin_db(None))  # email not taken

        res = client.post("/api/admin/register", json={
            "name": "New Admin", "email": "new@test.com", "password": "securepass"
        })
        assert res.status_code == 201
        data = res.json()
        assert "access_token" in data
        assert data["message"] == "Admin registered successfully"

    def test_register_duplicate_email(self, client):
        _override(admin_db=make_mock_admin_db(SAMPLE_ADMIN))  # email already exists

        res = client.post("/api/admin/register", json={
            "name": "Dup", "email": "admin@test.com", "password": "pass"
        })
        assert res.status_code == 400
        assert "already exists" in res.json()["detail"]


# ═══════════════════════════════════════════════════════════════════════════════
#  STUDENT ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestGetStudents:
    def setup_method(self):
        _reset()

    def test_returns_student_list(self, client):
        _override(user_db=make_mock_user_db(all_users=[SAMPLE_STUDENT]))

        student_no_emb = {k: v for k, v in SAMPLE_STUDENT.items() if k != "image_embeddings"}
        res = client.get("/api/admin/students", headers=_auth_headers())
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert "image_embeddings" not in data[0]

    def test_requires_auth(self, client):
        res = client.get("/api/admin/students")
        assert res.status_code == 401

    def test_returns_empty_list(self, client):
        _override(user_db=make_mock_user_db(all_users=[]))

        res = client.get("/api/admin/students", headers=_auth_headers())
        assert res.status_code == 200
        assert res.json() == []


class TestUpdateStudent:
    def setup_method(self):
        _reset()

    def test_update_name(self, client):
        _override(user_db=make_mock_user_db(user_doc=SAMPLE_STUDENT))

        res = client.put(
            "/api/admin/students/PRN001",
            headers=_auth_headers(),
            data={"name": "Alice Updated"}
        )
        assert res.status_code == 200
        data = res.json()
        assert "name" in data["updated_fields"]

    def test_update_nonexistent_student(self, client):
        _override(user_db=make_mock_user_db(user_doc=None))

        res = client.put(
            "/api/admin/students/FAKE999",
            headers=_auth_headers(),
            data={"name": "Ghost"}
        )
        assert res.status_code == 404

    def test_update_no_fields_raises_400(self, client):
        _override(user_db=make_mock_user_db(user_doc=SAMPLE_STUDENT))

        res = client.put(
            "/api/admin/students/PRN001",
            headers=_auth_headers(),
            data={}
        )
        assert res.status_code == 400


class TestDeleteStudent:
    def setup_method(self):
        _reset()

    def test_delete_success(self, client):
        _override(user_db=make_mock_user_db(user_doc=SAMPLE_STUDENT))

        res = client.delete("/api/admin/students/PRN001", headers=_auth_headers())
        assert res.status_code == 200
        assert "removed" in res.json()["message"].lower()

    def test_delete_nonexistent(self, client):
        _override(user_db=make_mock_user_db(user_doc=None))

        res = client.delete("/api/admin/students/FAKE999", headers=_auth_headers())
        assert res.status_code == 404

    def test_delete_requires_auth(self, client):
        res = client.delete("/api/admin/students/PRN001")
        assert res.status_code == 401


# ═══════════════════════════════════════════════════════════════════════════════
#  ATTENDANCE RECORD ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestGetAttendance:
    def setup_method(self):
        _reset()

    def test_returns_all_sessions(self, client):
        session_no_id = {**SAMPLE_SESSION}
        _override(att_db=make_mock_att_db(sessions=[session_no_id]))

        res = client.get("/api/admin/attendance", headers=_auth_headers())
        assert res.status_code == 200
        data = res.json()
        assert data["total"] == 1
        assert len(data["records"]) == 1

    def test_empty_sessions(self, client):
        _override(att_db=make_mock_att_db(sessions=[]))

        res = client.get("/api/admin/attendance", headers=_auth_headers())
        assert res.status_code == 200
        assert res.json()["total"] == 0

    def test_requires_auth(self, client):
        res = client.get("/api/admin/attendance")
        assert res.status_code == 401


class TestGetSessionById:
    def setup_method(self):
        _reset()

    def test_found(self, client):
        session = {**SAMPLE_SESSION, "_id": MagicMock(__str__=lambda s: "session_id_1")}
        mock_att = make_mock_att_db()
        mock_att.get_session_by_id = AsyncMock(return_value=SAMPLE_SESSION)
        _override(att_db=mock_att)

        res = client.get("/api/admin/attendance/session_id_1", headers=_auth_headers())
        assert res.status_code == 200

    def test_not_found(self, client):
        mock_att = make_mock_att_db()
        mock_att.get_session_by_id = AsyncMock(return_value=None)
        _override(att_db=mock_att)

        res = client.get("/api/admin/attendance/does_not_exist", headers=_auth_headers())
        assert res.status_code == 404


class TestDeleteSession:
    def setup_method(self):
        _reset()

    def test_delete_existing_session(self, client):
        mock_att = make_mock_att_db()
        mock_att.get_session_by_id = AsyncMock(return_value=SAMPLE_SESSION)
        mock_att.delete_session = AsyncMock(return_value=True)
        _override(att_db=mock_att)

        res = client.delete("/api/admin/attendance/session_id_1", headers=_auth_headers())
        assert res.status_code == 200
        assert "deleted" in res.json()["message"].lower()

    def test_delete_nonexistent_session(self, client):
        mock_att = make_mock_att_db()
        mock_att.get_session_by_id = AsyncMock(return_value=None)
        _override(att_db=mock_att)

        res = client.delete("/api/admin/attendance/ghost_id", headers=_auth_headers())
        assert res.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
#  MANUAL SESSION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestCreateManualSession:
    def setup_method(self):
        _reset()

    def test_creates_session_with_all_students(self, client):
        mock_user = make_mock_user_db(all_users=[SAMPLE_STUDENT])
        mock_att = make_mock_att_db()
        mock_att.insert_session = AsyncMock(return_value="new_session_id")
        _override(user_db=mock_user, att_db=mock_att)

        payload = {
            "date": "2026-05-21",
            "time_from": "09:00",
            "time_to": "10:00",
            "subject": "Algorithms",
        }
        res = client.post("/api/admin/mark_attendance/manual/session",
                          json=payload, headers=_auth_headers())
        assert res.status_code == 200
        data = res.json()
        assert "session_id" in data
        assert data["total_students"] == 1

    def test_fails_with_no_students(self, client):
        mock_user = make_mock_user_db(all_users=[])
        mock_att = make_mock_att_db()
        _override(user_db=mock_user, att_db=mock_att)

        res = client.post("/api/admin/mark_attendance/manual/session",
                          json={"date": "2026-05-21"}, headers=_auth_headers())
        assert res.status_code == 400


class TestToggleAttendance:
    def setup_method(self):
        _reset()

    def test_toggle_absent_to_present(self, client):
        session_with_student = {
            **SAMPLE_SESSION,
            "_id": MagicMock(__str__=lambda s: "session_id_1"),
            "students": [
                {"prn": "PRN001", "name": "Alice", "status": "absent", "email": "alice@college.edu"}
            ]
        }
        student_doc = {**SAMPLE_STUDENT, "attendance": []}

        mock_att = make_mock_att_db()
        mock_att.get_session_by_id = AsyncMock(return_value=session_with_student)
        mock_att.update_student_status_in_session = AsyncMock()

        mock_user = make_mock_user_db(user_doc=student_doc)

        _override(user_db=mock_user, att_db=mock_att)

        with patch("app.routes.admin.send_attendance_email", return_value=True):
            res = client.put(
                "/api/admin/mark_attendance/manual/toggle/session_id_1",
                json={"prn": "PRN001", "status": "present"},
                headers=_auth_headers()
            )
        assert res.status_code == 200
        assert res.json()["changed"] is True

    def test_toggle_invalid_status(self, client):
        mock_att = make_mock_att_db()
        mock_att.get_session_by_id = AsyncMock(return_value=SAMPLE_SESSION)
        _override(att_db=mock_att)

        res = client.put(
            "/api/admin/mark_attendance/manual/toggle/session_id_1",
            json={"prn": "PRN001", "status": "maybe"},
            headers=_auth_headers()
        )
        assert res.status_code == 400

    def test_toggle_nonexistent_session(self, client):
        mock_att = make_mock_att_db()
        mock_att.get_session_by_id = AsyncMock(return_value=None)
        _override(att_db=mock_att)

        res = client.put(
            "/api/admin/mark_attendance/manual/toggle/bad_id",
            json={"prn": "PRN001", "status": "present"},
            headers=_auth_headers()
        )
        assert res.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
#  ROOT ENDPOINT
# ═══════════════════════════════════════════════════════════════════════════════

class TestRoot:
    def test_root_returns_welcome(self, client):
        res = client.get("/")
        assert res.status_code == 200
        assert "AttendSnap" in res.json()["message"]
