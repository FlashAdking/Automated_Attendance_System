"""
test_models.py — Unit tests for AttendanceDB and UserDB model methods.

All motor async calls are replaced with AsyncMocks so no real MongoDB
connection is required.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from bson import ObjectId


# ── We need to mock motor before importing the models ─────────────────────
import sys
sys.modules.setdefault("motor", MagicMock())
sys.modules.setdefault("motor.motor_asyncio", MagicMock())


# ═══════════════════════════════════════════════════════════════════════════════
#  AttendanceDB model
# ═══════════════════════════════════════════════════════════════════════════════

class TestAttendanceDB:
    """Tests for AttendanceDB methods using mocked motor collection."""

    def _make_db(self):
        from app.models.attendance_db import AttendanceDB
        db = AttendanceDB.__new__(AttendanceDB)
        db.collection = MagicMock()
        return db

    @pytest.mark.asyncio
    async def test_insert_session(self):
        db = self._make_db()
        fake_id = ObjectId()
        db.collection.insert_one = AsyncMock(return_value=MagicMock(inserted_id=fake_id))

        result = await db.insert_session({"date": "2026-05-21", "students": []})
        assert result == fake_id
        db.collection.insert_one.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_all_sessions_sorted(self):
        db = self._make_db()
        sessions = [{"date": "2026-05-20"}, {"date": "2026-05-19"}]
        cursor = MagicMock()
        cursor.sort = MagicMock(return_value=cursor)
        cursor.to_list = AsyncMock(return_value=sessions)
        db.collection.find = MagicMock(return_value=cursor)

        result = await db.get_all_sessions()
        assert result == sessions
        cursor.sort.assert_called_with("date", -1)

    @pytest.mark.asyncio
    async def test_get_session_by_id_valid(self):
        db = self._make_db()
        fake_id = str(ObjectId())
        expected = {"date": "2026-05-20", "students": []}
        db.collection.find_one = AsyncMock(return_value=expected)

        result = await db.get_session_by_id(fake_id)
        assert result == expected

    @pytest.mark.asyncio
    async def test_get_session_by_id_invalid_returns_none(self):
        db = self._make_db()
        result = await db.get_session_by_id("not-a-valid-objectid")
        assert result is None

    @pytest.mark.asyncio
    async def test_update_student_status_present(self):
        db = self._make_db()
        db.collection.update_one = AsyncMock()
        fake_id = str(ObjectId())

        await db.update_student_status_in_session(fake_id, "PRN001", "present")
        db.collection.update_one.assert_called_once()
        call_args = db.collection.update_one.call_args[0]
        update = call_args[1]
        assert update["$set"]["students.$.status"] == "present"
        assert update["$inc"]["present_count"] == 1
        assert update["$inc"]["absent_count"] == -1

    @pytest.mark.asyncio
    async def test_update_student_status_absent(self):
        db = self._make_db()
        db.collection.update_one = AsyncMock()
        fake_id = str(ObjectId())

        await db.update_student_status_in_session(fake_id, "PRN001", "absent")
        call_args = db.collection.update_one.call_args[0]
        update = call_args[1]
        assert update["$set"]["students.$.status"] == "absent"
        assert update["$inc"]["present_count"] == -1
        assert update["$inc"]["absent_count"] == 1

    @pytest.mark.asyncio
    async def test_delete_session_success(self):
        db = self._make_db()
        fake_id = str(ObjectId())
        db.collection.delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))

        result = await db.delete_session(fake_id)
        assert result is True

    @pytest.mark.asyncio
    async def test_delete_session_not_found(self):
        db = self._make_db()
        fake_id = str(ObjectId())
        db.collection.delete_one = AsyncMock(return_value=MagicMock(deleted_count=0))

        result = await db.delete_session(fake_id)
        assert result is False

    @pytest.mark.asyncio
    async def test_delete_session_invalid_id_returns_false(self):
        db = self._make_db()
        result = await db.delete_session("not-a-valid-objectid")
        assert result is False


# ═══════════════════════════════════════════════════════════════════════════════
#  UserDB model
# ═══════════════════════════════════════════════════════════════════════════════

class TestUserDB:
    def _make_db(self):
        from app.models.user_db import UserDB
        db = UserDB.__new__(UserDB)
        db.collection = MagicMock()
        return db

    @pytest.mark.asyncio
    async def test_find_user_by_prn(self):
        db = self._make_db()
        expected = {"prn": "PRN001", "name": "Alice"}
        db.collection.find_one = AsyncMock(return_value=expected)

        result = await db.find_user_by_prn("PRN001")
        assert result == expected
        db.collection.find_one.assert_called_with({"prn": "PRN001"})

    @pytest.mark.asyncio
    async def test_find_user_by_prn_not_found(self):
        db = self._make_db()
        db.collection.find_one = AsyncMock(return_value=None)

        result = await db.find_user_by_prn("FAKE")
        assert result is None

    @pytest.mark.asyncio
    async def test_insert_user(self):
        db = self._make_db()
        fake_id = ObjectId()
        db.collection.insert_one = AsyncMock(return_value=MagicMock(inserted_id=fake_id))

        result = await db.insert_user({"prn": "PRN002", "name": "Bob"})
        assert result == fake_id

    @pytest.mark.asyncio
    async def test_update_user(self):
        db = self._make_db()
        db.collection.update_one = AsyncMock()

        await db.update_user("PRN001", {"name": "Alice Updated"})
        db.collection.update_one.assert_called_with(
            {"prn": "PRN001"}, {"$set": {"name": "Alice Updated"}}
        )

    @pytest.mark.asyncio
    async def test_delete_user(self):
        db = self._make_db()
        db.collection.delete_one = AsyncMock()

        await db.delete_user("PRN001")
        db.collection.delete_one.assert_called_with({"prn": "PRN001"})

    @pytest.mark.asyncio
    async def test_mark_attendance_appends_record(self):
        db = self._make_db()
        db.collection.update_one = AsyncMock()
        record = {"date": "2026-05-21", "status": "present", "method": "ai"}

        await db.mark_attendance("PRN001", record)
        db.collection.update_one.assert_called_with(
            {"prn": "PRN001"},
            {"$push": {"attendance": record}}
        )

    @pytest.mark.asyncio
    async def test_find_all_users(self):
        db = self._make_db()
        users = [{"prn": "PRN001"}, {"prn": "PRN002"}]
        cursor = MagicMock()
        cursor.to_list = AsyncMock(return_value=users)
        db.collection.find = MagicMock(return_value=cursor)

        result = await db.find_all_users()
        assert result == users

    @pytest.mark.asyncio
    async def test_get_all_embeddings_projection(self):
        db = self._make_db()
        embeddings = [{"prn": "PRN001", "name": "Alice", "image_embeddings": [0.1] * 512}]
        cursor = MagicMock()
        cursor.to_list = AsyncMock(return_value=embeddings)
        db.collection.find = MagicMock(return_value=cursor)

        result = await db.get_all_embeddings()
        assert result == embeddings
        # Verify the projection was applied
        db.collection.find.assert_called_with(
            {}, {"prn": 1, "name": 1, "image_embeddings": 1, "_id": 0}
        )
