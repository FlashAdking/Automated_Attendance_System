import motor.motor_asyncio
from typing import List, Dict, Any

class UserDB:
    def __init__(self, db_url: str, db_name: str, collection_name: str):
        self.client = motor.motor_asyncio.AsyncIOMotorClient(db_url)
        self.db = self.client[db_name]
        self.collection = self.db[collection_name]
    
    async def insert_user(self, user: dict) -> Any:
        result = await self.collection.insert_one(user)
        return result.inserted_id
    
    async def find_user_by_email(self, email: str) -> dict:
        return await self.collection.find_one({"email": email})
        
    async def find_user_by_prn(self, prn: str) -> dict:
        return await self.collection.find_one({"prn": prn})
    
    async def find_all_users(self) -> List[dict]:
        return await self.collection.find({}).to_list(1000)
        
    async def get_all_embeddings(self) -> List[dict]:
        """Fetch only PRNs, Names and Embeddings for face recognition."""
        cursor = self.collection.find(
            {}, 
            {"prn": 1, "name": 1, "image_embeddings": 1, "_id": 0}
        )
        return await cursor.to_list(1000)
    
    async def update_user(self, prn: str, update_data: dict):
        await self.collection.update_one({"prn": prn}, {"$set": update_data})
    
    async def delete_user(self, prn: str):
        await self.collection.delete_one({"prn": prn})
        
    async def mark_attendance(self, prn: str, attendance_record: dict):
        """Append a new attendance record to the user's attendance array."""
        await self.collection.update_one(
            {"prn": prn},
            {"$push": {"attendance": attendance_record}}
        )    