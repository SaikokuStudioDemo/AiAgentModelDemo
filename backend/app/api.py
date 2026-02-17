from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from app.models import Agent, ChatRequest, ChatResponse
from app.services import AgentService
from app.graph import update_app, chat_app
import asyncio
import os

router = APIRouter()

@router.get("/agents", response_model=list[Agent])
def get_agents():
    return AgentService.get_all_agents()

@router.get("/agents/{agent_id}", response_model=Agent)
def get_agent(agent_id: str):
    agent = AgentService.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent

@router.post("/agents/{agent_id}/update")
async def trigger_update(agent_id: str, background_tasks: BackgroundTasks):
    agent = AgentService.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Extract Law ID from Source URL
    # URL format: https://laws.e-gov.go.jp/law/{LAW_ID}
    source_url = agent.ram_status.source_url
    law_id = source_url.split("/")[-1]
    
    # Helper to run async graph in background
    async def run_update_graph():
        AgentService.update_agent_status(agent_id, "Updating...")
        inputs = {"agent_id": agent_id, "law_id": law_id, "raw_content": "", "parsed_chunks": [], "status": "Start"}
        await update_app.ainvoke(inputs)
    
    background_tasks.add_task(run_update_graph)
    return {"status": "Update process started", "graph_id": "update_flow"}

@router.get("/laws/{law_id}/raw")
def get_law_raw(law_id: str):
    # Construct absolute path to avoid CWD issues
    # api.py is in backend/app, so data/raw is in backend/data/raw
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # backend/
    file_path = os.path.join(base_dir, "data", "raw", f"{law_id}.xml")
    
    if not os.path.exists(file_path):
        print(f"File not found at: {file_path}") # Debug log
        raise HTTPException(status_code=404, detail=f"Raw data not found at {file_path}. Please update RAM first.")
    
    return FileResponse(file_path, media_type="text/xml", filename=f"{law_id}.xml")

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    inputs = {"question": request.message, "agent_id": request.agent_id, "context": [], "answer": ""}
    result = await chat_app.ainvoke(inputs)
    return ChatResponse(
        response=result["answer"],
        source_nodes=["retrieve", "generate"]
    )
