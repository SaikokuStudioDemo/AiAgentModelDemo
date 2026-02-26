from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.database import get_db
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

from pydantic import BaseModel
from app.models import AgentType
import uuid

class CreateAgentRequest(BaseModel):
    name: str
    type: AgentType
    description: str

@router.post("/agents", response_model=Agent)
def create_agent(request: CreateAgentRequest):
    # Generate a unique simple ID like tax_1a2b3c
    new_id = f"{request.type.value.split('-')[0].lower()}_{uuid.uuid4().hex[:6]}"
    
    new_agent = Agent(
        id=new_id,
        name=request.name,
        type=request.type,
        description=request.description,
        ram_sources=[]
    )
    
    try:
        created = AgentService.create_agent(new_agent)
        return created
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

from pydantic import BaseModel

class UpdateRequest(BaseModel):
    url: str



@router.post("/agents/{agent_id}/update")
async def trigger_update(agent_id: str, request: UpdateRequest, background_tasks: BackgroundTasks):
    agent = AgentService.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Verify URL exists in agent sources
    source_exists = any(source.url == request.url for source in agent.ram_sources)
    if not source_exists:
        raise HTTPException(status_code=404, detail="Source URL not found for this agent")

    # Extract Law ID from Source URL
    # URL format: https://laws.e-gov.go.jp/law/{LAW_ID}
    source_url = request.url
    law_id = source_url.split("/")[-1]
    
    # Helper to run async graph in background
    async def run_update_graph():
        AgentService.update_source_status(agent_id, request.url, "Updating...")
        inputs = {"agent_id": agent_id, "law_id": law_id, "raw_content": "", "parsed_chunks": [], "status": "Start", "url": request.url}
        await update_app.ainvoke(inputs)
    
    background_tasks.add_task(run_update_graph)
    return {"status": "Update process started", "graph_id": "update_flow"}



@router.get("/laws/{law_id}/raw")
async def get_law_raw(law_id: str, db: Session = Depends(get_db)):
    from app.models_db import Law
    law = db.query(Law).filter(Law.law_id == law_id).first()
    
    if not law:
        raise HTTPException(status_code=404, detail="Law not found in database.")
        
    xml_content = law.full_text
    
    # On-the-fly fetch if missing
    if not xml_content:
        import httpx
        url = f"https://laws.e-gov.go.jp/api/1/lawdata/{law_id}"
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    import xml.etree.ElementTree as ET
                    root = ET.fromstring(response.content)
                    law_full_text = root.find(".//LawFullText")
                    if law_full_text is not None:
                        xml_content = ET.tostring(law_full_text, encoding="unicode")
                        law.full_text = xml_content
                        db.commit()
                else:
                    raise HTTPException(status_code=response.status_code, detail="Failed to fetch from e-Gov")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch on-the-fly: {e}")
            
    if not xml_content:
         raise HTTPException(status_code=404, detail="XML content could not be found or downloaded.")

    # Simple XML to HTML conversion
    import xml.etree.ElementTree as ET
    try:
        root = ET.fromstring(xml_content)
        
        law_title = root.find(".//LawTitle")
        law_title_text = law_title.text if law_title is not None else "Unknown Law"
        
        html_content = f"<html><head><meta charset='utf-8'><title>{law_title_text}</title><style>body {{ font-family: sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; line-height: 1.6; }} .article {{ margin-bottom: 2rem; }} .article-title {{ font-weight: bold; font-size: 1.2rem; margin-bottom: 0.5rem; }}</style></head><body><h1>{law_title_text}</h1>"
        
        articles = root.findall(".//Article")
        for article in articles:
            html_content += "<div class='article'>"
            title = article.find("ArticleTitle")
            if title is not None and title.text:
                html_content += f"<div class='article-title'>{title.text}</div>"
            
            for sentence in article.findall(".//ParagraphSentence/Sentence"):
                if sentence.text:
                    html_content += f"<p>{sentence.text}</p>"
            html_content += "</div>"
            
        html_content += "</body></html>"
        
        from fastapi.responses import HTMLResponse, Response
        return HTMLResponse(content=html_content, status_code=200, headers={"Content-Disposition": "inline", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"})
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Exception parsing XML: {e}")
        # Fallback to serving raw XML if parsing fails
        from fastapi.responses import Response
        return Response(content=xml_content, media_type="text/xml")

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    history_dicts = [{"role": h.role, "content": h.content} for h in request.history]
    inputs = {"question": request.message, "agent_id": request.agent_id, "model": request.model, "history": history_dicts, "context": [], "answer": ""}
    result = await chat_app.ainvoke(inputs)
    return ChatResponse(
        response=result["answer"],
        source_nodes=["retrieve", "generate"]
    )
