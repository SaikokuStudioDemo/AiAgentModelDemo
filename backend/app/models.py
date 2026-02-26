from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from enum import Enum

class AgentType(str, Enum):
    TAX = "Tax-Agent"
    LEGAL = "Legal-Agent"
    LABOR = "Labor-Agent"

class RAMSource(BaseModel):
    url: str
    title: Optional[str] = None
    status: str = "Synced"  # Synced, Updating, Error
    last_updated: Optional[datetime] = None
    doc_count: int = 0

class Agent(BaseModel):
    id: str
    name: str
    type: AgentType
    description: str
    ram_sources: List[RAMSource] = []
    
class ChatMessageDict(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    agent_id: str
    model: str = "gemini-2.5-flash-lite"
    history: List[ChatMessageDict] = []

class ChatResponse(BaseModel):
    response: str
    source_nodes: List[str] = [] # For visualization
