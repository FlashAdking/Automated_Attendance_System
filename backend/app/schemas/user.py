from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date

class Student(BaseModel):
    name: str
    prn: str
    academic_class: str = Field(..., alias="class")
    div: str
    dob: str
    image_link: str
    contact: str
    email: str
    gender: str
    image_embeddings: List[float] = Field(..., max_items=512, min_items=512)
    attendance: List[dict] = []