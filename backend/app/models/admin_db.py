# implement admin database using mongodb 


import motor.motor_asyncio
from typing import List, Dict, Any

class AdminDB:
    def __init__(self, db_url: str, db_name: str, collection_name: str):
        self.client = motor.motor_asyncio.AsyncIOMotorClient(db_url)
        self.db = self.client[db_name]
        self.collection = self.db[collection_name]
    
    async def insert_admin(self, admin: dict) -> Any:
        result = await self.collection.insert_one(admin)
        return result.inserted_id
    
    async def find_admin_by_email(self, email: str) -> dict:
        return await self.collection.find_one({"email": email})
    
    async def update_admin(self, email: str, update_data: dict):
        await self.collection.update_one({"email": email}, {"$set": update_data})
    
    async def delete_admin(self, email: str):
        await self.collection.delete_one({"email": email})
    
    async def find_all_admins(self) -> List[dict]:
        return await self.collection.find({}).to_list(1000)