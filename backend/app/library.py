from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Dict, Any
import httpx
from datetime import datetime
from app.database import get_db
from app.models_db import Law, AgentLawMapping

router = APIRouter()

from app.sync_tasks import start_sync_background, SYNC_STATUS

def process_pending_mappings():
    """
    Finds all AgentLawMappings with status='Pending' and processes them through LangGraph.
    This is meant to be run by a background scheduler after fetch_and_upsert.
    """
    from app.database import SessionLocal
    from app.graph import update_app
    from app.services import AgentService
    from app.models import RAMSource
    import asyncio
    
    with SessionLocal() as db_session:
        pending_mappings = db_session.query(AgentLawMapping).filter(AgentLawMapping.status == "Pending").all()
        
        if not pending_mappings:
            return
            
        print(f"Found {len(pending_mappings)} pending mappings to process.")
        
        async def _process_all(mappings):
            for mapping in mappings:
                agent = AgentService.get_agent(mapping.agent_id)
                source_url = f"https://laws.e-gov.go.jp/api/1/lawdata/{mapping.law_id}"
                
                law_to_add = db_session.query(Law).filter(Law.law_id == mapping.law_id).first()
                official_title = law_to_add.title if law_to_add else None
                
                if agent and not any(source.url == source_url for source in agent.ram_sources):
                    agent.ram_sources.append(RAMSource(url=source_url, title=official_title))
                
                AgentService.update_source_status(mapping.agent_id, source_url, "Updating...")
                
                inputs = {
                    "agent_id": mapping.agent_id, 
                    "law_id": mapping.law_id, 
                    "raw_content": "", 
                    "parsed_chunks": [], 
                    "status": "Start", 
                    "url": source_url,
                    "title": official_title
                }
                
                try:
                    print(f"Auto-processing graph for Agent {mapping.agent_id}, Law {mapping.law_id}")
                    await update_app.ainvoke(inputs)
                    
                    # Reload mapping attached to this session and update
                    m = db_session.query(AgentLawMapping).filter(
                        AgentLawMapping.agent_id == mapping.agent_id,
                        AgentLawMapping.law_id == mapping.law_id
                    ).first()
                    if m:
                        m.status = "Synced"
                        db_session.commit()
                        
                    # Also update the in-memory RAM source status for the UI
                    AgentService.update_source_status(mapping.agent_id, source_url, "Synced")
                except Exception as e:
                    print(f"Error processing pending mapping {mapping.law_id}: {e}")
                    AgentService.update_source_status(mapping.agent_id, source_url, "Error")
                    
        asyncio.run(_process_all(pending_mappings))

@router.post("/process_pending")
def trigger_process_pending(background_tasks: BackgroundTasks):
    background_tasks.add_task(process_pending_mappings)
    return {"status": "Processing pending mappings in background."}

@router.post("/sync_incremental")
async def sync_laws_incremental(background_tasks: BackgroundTasks):
    if SYNC_STATUS["is_syncing"]:
        return {"status": "Already syncing", "message": SYNC_STATUS["message"]}
    background_tasks.add_task(start_sync_background, "incremental")
    return {"status": "Incremental sync started in background"}

@router.post("/sync_full")
async def sync_laws_full(background_tasks: BackgroundTasks):
    if SYNC_STATUS["is_syncing"]:
        return {"status": "Already syncing", "message": SYNC_STATUS["message"]}
    background_tasks.add_task(start_sync_background, "full")
    return {"status": "Full sync started in background"}

@router.get("/sync_status")
def get_sync_status():
    return SYNC_STATUS

@router.get("/laws")
def get_library_laws(db: Session = Depends(get_db)):
    """
    Returns the matrix data: A list of all laws and which agents are mapped to them.
    Limits to 500 for performance on the frontend, or implement pagination realistically.
    For this prototype, let's limit to 1000 so the UI doesn't crash.
    """
    laws = db.query(Law).limit(1000).all()
    
    result = []
    for law in laws:
        mappings = {m.agent_id: m.status for m in law.agent_mappings}
        
        result.append({
            "law_id": law.law_id,
            "law_num": law.law_num,
            "title": law.title,
            "promulgation_date": law.promulgation_date.isoformat() if law.promulgation_date else None,
            "mappings": mappings
        })
        
    return result

from pydantic import BaseModel

class MappingRequest(BaseModel):
    agent_id: str
    law_id: str
    checked: bool

@router.post("/mappings")
async def toggle_mapping(request: MappingRequest, db: Session = Depends(get_db)):
    """
    Assign or unassign a law to an agent. Triggers actual Vector DB LangGraph logic.
    """
    print(f"DEBUG /mappings: Received request for agent {request.agent_id}, law {request.law_id}, checked={request.checked}")
    
    existing_mapping = db.query(AgentLawMapping).filter(
        AgentLawMapping.agent_id == request.agent_id,
        AgentLawMapping.law_id == request.law_id
    ).first()
    
    print(f"DEBUG /mappings: existing_mapping is {existing_mapping}")

    if request.checked:
        print("DEBUG /mappings: request.checked is TRUE")
        if not existing_mapping:
            print("DEBUG /mappings: creating new mapping and triggering graph")
            new_mapping = AgentLawMapping(
                agent_id=request.agent_id,
                law_id=request.law_id,
                status="Pending"
            )
            db.add(new_mapping)
            db.commit()
            
            # Trigger LangGraph update_app to parse and embed
            from app.graph import update_app
            from app.services import AgentService
            
            try:
                # Add source to agent's RAM if it doesn't exist
                agent = AgentService.get_agent(request.agent_id)
                source_url = f"https://laws.e-gov.go.jp/api/1/lawdata/{request.law_id}"
                
                # Get official title from DB
                law_to_add = db.query(Law).filter(Law.law_id == request.law_id).first()
                official_title = law_to_add.title if law_to_add else None
                
                if agent and not any(source.url == source_url for source in agent.ram_sources):
                    from app.models import RAMSource
                    agent.ram_sources.append(RAMSource(url=source_url, title=official_title))
                
                AgentService.update_source_status(request.agent_id, source_url, "Updating...")
                
                inputs = {
                    "agent_id": request.agent_id, 
                    "law_id": request.law_id, 
                    "raw_content": "", 
                    "parsed_chunks": [], 
                    "status": "Start", 
                    "url": source_url,
                    "title": official_title
                }
                
                # Await the graph execution directly inline to avoid threadpool collision
                print(f"Triggering LangGraph for {request.law_id} directly...")
                await update_app.ainvoke(inputs)
                
                # Update SQLite status
                mapping_to_update = db.query(AgentLawMapping).filter(
                    AgentLawMapping.agent_id == request.agent_id,
                    AgentLawMapping.law_id == request.law_id
                ).first()
                if mapping_to_update:
                    mapping_to_update.status = "Synced"
                    db.commit()
                print("DEBUG /mappings: Finished Graph Sync")
            except Exception as e:
                print(f"Graph Execution Error: {e}")
        else:
            print("DEBUG /mappings: existing_mapping was already true, skipping graph execution.")
            
    else:
        print("DEBUG /mappings: request.checked is FALSE")
        if existing_mapping:
            print("DEBUG /mappings: deleting existing mapping")
            db.delete(existing_mapping)
            db.commit()
            
            # Remove from Vector DB and RAM sources
            from app.vector_store import vector_store
            from app.services import AgentService
            
            source_url = f"https://laws.e-gov.go.jp/api/1/lawdata/{request.law_id}"
            AgentService.delete_source(request.agent_id, source_url)
            
    return {"status": "Success"}
