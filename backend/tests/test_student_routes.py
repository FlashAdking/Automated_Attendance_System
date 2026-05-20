"""
test_student_routes.py — Tests for /api/student/* endpoints.

Covers the public trial demo, attendance history, summary, and
the student self-service lookup endpoint.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

from tests.conftest import (
    SAMPLE_STUDENT, make_mock_user_db, _auth_headers,
)
from app.main import app
from app.database import get_user_db


def _override_user(user_doc=None, all_users=None):
    db = make_mock_user_db(user_doc=user_doc, all_users=all_users)
    app.dependency_overrides[get_user_db] = lambda: db
    return db


def _reset():
    app.dependency_overrides.clear()


# ═══════════════════════════════════════════════════════════════════════════════
#  STUDENT LOOKUP (self-service portal)
# ═══════════════════════════════════════════════════════════════════════════════

class TestStudentLookup:
    def setup_method(self):
        _reset()

    def test_valid_prn_and_dob(self, client):
        _override_user(user_doc=SAMPLE_STUDENT)

        res = client.post("/api/student/lookup?prn=PRN001&dob=2002-05-15")
        assert res.status_code == 200
        data = res.json()
        assert data["prn"] == "PRN001"
        assert data["name"] == "Alice Smith"
        assert "summary" in data
        assert "history" in data
        # image_embeddings must be stripped
        assert "image_embeddings" not in data

    def test_wrong_dob_returns_401(self, client):
        _override_user(user_doc=SAMPLE_STUDENT)

        res = client.post("/api/student/lookup?prn=PRN001&dob=1990-01-01")
        assert res.status_code == 401
        assert "do not match" in res.json()["detail"]

    def test_unknown_prn_returns_404(self, client):
        _override_user(user_doc=None)

        res = client.post("/api/student/lookup?prn=FAKE999&dob=2002-05-15")
        assert res.status_code == 404

    def test_attendance_summary_calculated_correctly(self, client):
        _override_user(user_doc=SAMPLE_STUDENT)

        res = client.post("/api/student/lookup?prn=PRN001&dob=2002-05-15")
        assert res.status_code == 200
        summary = res.json()["summary"]
        # SAMPLE_STUDENT has 3 records: 2 present, 1 absent
        assert summary["total_sessions"] == 3
        assert summary["present_count"] == 2
        assert summary["absent_count"] == 1
        assert summary["attendance_percentage"] == pytest.approx(66.67, abs=0.1)

    def test_no_attendance_history(self, client):
        student_no_att = {**SAMPLE_STUDENT, "attendance": []}
        _override_user(user_doc=student_no_att)

        res = client.post("/api/student/lookup?prn=PRN001&dob=2002-05-15")
        assert res.status_code == 200
        summary = res.json()["summary"]
        assert summary["total_sessions"] == 0
        assert summary["attendance_percentage"] == 0.0


# ═══════════════════════════════════════════════════════════════════════════════
#  ATTENDANCE HISTORY
# ═══════════════════════════════════════════════════════════════════════════════

class TestAttendanceHistory:
    def setup_method(self):
        _reset()

    def test_returns_history(self, client):
        _override_user(user_doc=SAMPLE_STUDENT)

        res = client.get("/api/student/attendance/history/PRN001")
        assert res.status_code == 200
        data = res.json()
        assert data["prn"] == "PRN001"
        assert len(data["history"]) == 3

    def test_unknown_prn(self, client):
        _override_user(user_doc=None)

        res = client.get("/api/student/attendance/history/FAKE999")
        assert res.status_code == 404

    def test_empty_history(self, client):
        student = {**SAMPLE_STUDENT, "attendance": []}
        _override_user(user_doc=student)

        res = client.get("/api/student/attendance/history/PRN001")
        assert res.status_code == 200
        assert res.json()["history"] == []


# ═══════════════════════════════════════════════════════════════════════════════
#  ATTENDANCE SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════

class TestAttendanceSummary:
    def setup_method(self):
        _reset()

    def test_summary_calculation(self, client):
        _override_user(user_doc=SAMPLE_STUDENT)

        res = client.get("/api/student/attendance/summary/PRN001")
        assert res.status_code == 200
        data = res.json()
        assert data["prn"] == "PRN001"
        assert data["total_sessions"] == 3
        assert data["present_count"] == 2
        assert data["absent_count"] == 1
        assert data["attendance_percentage"] == pytest.approx(66.67, abs=0.1)

    def test_summary_no_records(self, client):
        student = {**SAMPLE_STUDENT, "attendance": []}
        _override_user(user_doc=student)

        res = client.get("/api/student/attendance/summary/PRN001")
        assert res.status_code == 200
        assert res.json()["attendance_percentage"] == 0.0

    def test_summary_unknown_prn(self, client):
        _override_user(user_doc=None)

        res = client.get("/api/student/attendance/summary/FAKE999")
        assert res.status_code == 404

    def test_all_present(self, client):
        student = {
            **SAMPLE_STUDENT,
            "attendance": [
                {"date": "2026-05-01", "status": "present"},
                {"date": "2026-05-02", "status": "present"},
            ]
        }
        _override_user(user_doc=student)

        res = client.get("/api/student/attendance/summary/PRN001")
        assert res.json()["attendance_percentage"] == 100.0


# ═══════════════════════════════════════════════════════════════════════════════
#  TRIAL ENDPOINT (public face recognition demo)
# ═══════════════════════════════════════════════════════════════════════════════

class TestTrialEndpoint:
    def setup_method(self):
        _reset()

    def test_missing_portraits_returns_422(self, client):
        """Trial endpoint requires both portraits and group_photos."""
        res = client.post("/api/student/trial", files={})
        # Missing required file fields → 422 Unprocessable Entity
        assert res.status_code == 422

    def test_too_many_portraits_returns_400(self, client):
        """Max 2 portraits allowed."""
        import io
        portraits = [
            ("portraits", ("p1.jpg", io.BytesIO(b"fake"), "image/jpeg")),
            ("portraits", ("p2.jpg", io.BytesIO(b"fake"), "image/jpeg")),
            ("portraits", ("p3.jpg", io.BytesIO(b"fake"), "image/jpeg")),
        ]
        groups = [("group_photos", ("g1.jpg", io.BytesIO(b"fake"), "image/jpeg"))]

        with patch("app.face_recognition.face_utils.load_models"):
            res = client.post("/api/student/trial", files=portraits + groups)
        assert res.status_code == 400
        assert "2 portrait" in res.json()["detail"]

    def test_too_many_group_photos_returns_400(self, client):
        import io
        portraits = [("portraits", ("p1.jpg", io.BytesIO(b"fake"), "image/jpeg"))]
        groups = [
            ("group_photos", ("g1.jpg", io.BytesIO(b"fake"), "image/jpeg")),
            ("group_photos", ("g2.jpg", io.BytesIO(b"fake"), "image/jpeg")),
            ("group_photos", ("g3.jpg", io.BytesIO(b"fake"), "image/jpeg")),
        ]

        with patch("app.face_recognition.face_utils.load_models"):
            res = client.post("/api/student/trial", files=portraits + groups)
        assert res.status_code == 400
        assert "2 group" in res.json()["detail"]
