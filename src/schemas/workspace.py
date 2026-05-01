from pydantic import BaseModel
from datetime import datetime
from typing import List

class WorkspaceBase(BaseModel):
    name: str

class WorkspaceCreate(WorkspaceBase):
    pass

class WorkspaceUpdate(BaseModel):
    name: str

class WorkspaceResponse(WorkspaceBase):
    id: int
    position: float
    created_at: datetime

    class Config:
        from_attributes = True

class WorkspaceReorder(BaseModel):
    ordered_ids: List[int]
