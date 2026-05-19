# user service will handle core business logic for users (students):
# login, checking attendance, and processing images/embeddings.

from app.models.user_db import UserDB

class UserService:
    def __init__(self, db: UserDB):
        self.db = db

    async def authenticate_student(self, email: str, password: str):
        """Authenticates a student and returns their details if valid"""
        # Note: In a real app, passwords should be hashed
        user = await self.db.find_user_by_email(email)
        if user and user.get("password") == password:
            return user
        return None

    async def get_student_attendance(self, prn: str):
        """Fetches the attendance history of a student"""
        user = await self.db.find_user_by_prn(prn)
        if user:
            return user.get("attendance", [])
        return None