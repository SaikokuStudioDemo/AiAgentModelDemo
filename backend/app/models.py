from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from enum import Enum

class AgentType(str, Enum):
    TAX = "Tax-Agent"
    LEGAL = "Legal-Agent"
    LABOR = "Labor-Agent"

class RAMStatus(BaseModel):
    last_updated: Optional[datetime] = None
    next_update_scheduled: Optional[datetime] = None
    status: str = "Idle"  # Idle, Updating, Error
    doc_count: int = 0
    source_url: str

class Agent(BaseModel):
    id: str
    name: str
    type: AgentType
    description: str
    ram_status: RAMStatus
    
class ChatRequest(BaseModel):
    message: str
    agent_id: str

class ChatResponse(BaseModel):
    response: str
    source_nodes: List[str] = [] # For visualization
