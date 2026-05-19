from pydantic import BaseModel, Field
from typing import List
from datetime import datetime

class Admin(BaseModel):
    name: str
    email: str
    password: str
    permissions: List[str] = []
    group_photos_user: List[str] = []
    created_at: datetime = Field(default_factory=datetime.now)