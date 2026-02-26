from sqlalchemy import Column, String, Date, DateTime, ForeignKey, Integer
from sqlalchemy.orm import relationship
import datetime
from app.database import Base

class Law(Base):
    __tablename__ = "laws"

    law_id = Column(String(50), primary_key=True, index=True)
    law_num = Column(String(100), nullable=False)
    title = Column(String(255), nullable=False)
    promulgation_date = Column(Date, nullable=True) # YYYY-MM-DD
    xml_file_path = Column(String(255), nullable=True)
    law_revision_id = Column(String(100), nullable=True)
    full_text = Column(String, nullable=True)
    last_synced_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationship to mappings
    agent_mappings = relationship("AgentLawMapping", back_populates="law", cascade="all, delete-orphan")

class AgentLawMapping(Base):
    __tablename__ = "agent_law_mappings"

    # Composite primary key conceptually, but we can just use agent_id and law_id
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    agent_id = Column(String(50), nullable=False, index=True)
    law_id = Column(String(50), ForeignKey("laws.law_id"), nullable=False, index=True)
    status = Column(String(20), default="Pending") # Pending, Syncing, Synced, Error
    last_embedded_at = Column(DateTime, nullable=True)

    law = relationship("Law", back_populates="agent_mappings")
