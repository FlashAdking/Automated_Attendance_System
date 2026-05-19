import motor.motor_asyncio
from bson import ObjectId
from typing import List, Dict, Any

class AttendanceDB:
    def __init__(self, db_url: str, db_name: str, collection_name: str):
        self.client = motor.motor_asyncio.AsyncIOMotorClient(db_url)
        self.db = self.client[db_name]
        self.collection = self.db[collection_name]
    
    async def insert_session(self, session_data: dict) -> Any:
        """Insert a new day-wise or session-wise attendance record."""
        result = await self.collection.insert_one(session_data)
        return result.inserted_id
    
    async def get_all_sessions(self) -> List[dict]:
        """Fetch all attendance sessions, sorted newest first."""
        cursor = self.collection.find({}).sort("date", -1)
        return await cursor.to_list(1000)
    
    async def get_session_by_date(self, date_str: str) -> dict:
        """Fetch a specific session by its date string."""
        return await self.collection.find_one({"date": date_str})
    
    async def get_session_by_id(self, session_id: str) -> dict:
        """Fetch a specific session by its MongoDB ObjectId."""
        try:
            return await self.collection.find_one({"_id": ObjectId(session_id)})
        except Exception:
            return None
    
    async def add_student_to_session(self, date_str: str, student_record: dict):
        """Used for manual attendance: push a student to an existing session."""
        await self.collection.update_one(
            {"date": date_str},
            {
                "$push": {"students": student_record},
                "$inc": {
                    "present_count": 1 if student_record.get("status") == "present" else 0,
                    "absent_count": 1 if student_record.get("status") == "absent" else 0,
                    "total_students": 1
                }
            }
        )

    async def update_student_status_in_session(self, session_id: str, prn: str, new_status: str):
        """Toggle a single student's status inside an existing session document."""
        old_status = "absent" if new_status == "present" else "present"
        await self.collection.update_one(
            {"_id": ObjectId(session_id), "students.prn": prn},
            {
                "$set": {"students.$.status": new_status},
                "$inc": {
                    "present_count": 1 if new_status == "present" else -1,
                    "absent_count": 1 if new_status == "absent" else -1,
                }
            }
        )

    async def update_session(self, session_id: str, update_data: dict):
        """Generic partial update on a session document."""
        await self.collection.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": update_data}
        )
