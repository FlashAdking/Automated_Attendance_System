import os
from app.models.admin_db import AdminDB
from app.models.user_db import UserDB
from app.models.attendance_db import AttendanceDB

# Load from environment variables with defaults
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "attendsnap")

# Global instances of the database classes
admin_db_instance = AdminDB(
    db_url=MONGO_URI,
    db_name=DB_NAME,
    collection_name="admins"
)

user_db_instance = UserDB(
    db_url=MONGO_URI,
    db_name=DB_NAME,
    collection_name="students"
)

attendance_db_instance = AttendanceDB(
    db_url=MONGO_URI,
    db_name=DB_NAME,
    collection_name="attendance_sessions"
)

# Dependency injection functions
def get_admin_db() -> AdminDB:
    return admin_db_instance

def get_user_db() -> UserDB:
    return user_db_instance

def get_attendance_db() -> AttendanceDB:
    return attendance_db_instance
