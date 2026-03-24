import asyncio
from datetime import datetime, timedelta
from typing import List, Dict
from app.models import Agent, RAMSource, AgentType

_NTA_FAQ_SOURCE = RAMSource(
    url="https://www.nta.go.jp/taxes/shiraberu/taxanswer/code/index.htm",
    title="国税庁タックスアンサー（FAQ）",
    status="Synced",
    source_type="nta_faq",
)

# Mock In-Memory Database
AGENTS_DB: Dict[str, Agent] = {
    "tax_01": Agent(
        id="tax_01",
        name="Tax Agent Alpha",
        type=AgentType.TAX,
        description="Specializes in Japanese Tax Law (Income Tax, Corporate Tax).",
        ram_sources=[_NTA_FAQ_SOURCE]
    ),
    "labor_01": Agent(
        id="labor_01",
        name="Labor Agent Beta",
        type=AgentType.LABOR,
        description="Expert in Labor Standards Act and workplace regulations.",
        ram_sources=[]
    )
}

class AgentService:
    @staticmethod
    def load_mappings_from_db():
        from app.database import SessionLocal
        from app.models_db import Law, AgentLawMapping
        
        db = SessionLocal()
        try:
            mappings = db.query(AgentLawMapping).all()
            for mapping in mappings:
                agent = AGENTS_DB.get(mapping.agent_id)
                if agent:
                    law = db.query(Law).filter(Law.law_id == mapping.law_id).first()
                    source_url = f"https://laws.e-gov.go.jp/api/1/lawdata/{mapping.law_id}"
                    
                    # Prevent duplicates (including NTA FAQ static source)
                    if not any(s.url == source_url for s in agent.ram_sources):
                        agent.ram_sources.append(
                            RAMSource(
                                url=source_url,
                                title=law.title if law else None,
                                status=mapping.status,
                                last_updated=mapping.last_embedded_at or datetime.now()
                            )
                        )
            print(f"Loaded {len(mappings)} mappings from SQLite into Agent RAM sources.")
        finally:
            db.close()

    @staticmethod
    def get_all_agents() -> List[Agent]:
        return list(AGENTS_DB.values())

    @staticmethod
    def get_agent(agent_id: str) -> Agent:
        return AGENTS_DB.get(agent_id)

    @staticmethod
    def create_agent(agent: Agent) -> Agent:
        if agent.id in AGENTS_DB:
            raise ValueError(f"Agent with ID {agent.id} already exists.")
        AGENTS_DB[agent.id] = agent
        return agent

    @staticmethod
    def update_source_status(agent_id: str, url: str, status: str, doc_count: int = None, title: str = None):
        if agent_id in AGENTS_DB:
            for source in AGENTS_DB[agent_id].ram_sources:
                if source.url == url:
                    source.status = status
                    if status == "Updated":
                        source.last_updated = datetime.now()
                        source.status = "Synced"
                    if doc_count is not None:
                        source.doc_count = doc_count
                    if title is not None:
                        source.title = title
                    break

    @staticmethod
    def delete_source(agent_id: str, url: str) -> bool:
        if agent_id in AGENTS_DB:
            original_len = len(AGENTS_DB[agent_id].ram_sources)
            
            # Extract law_id from the incoming URL which is likely format:
            # https://laws.e-gov.go.jp/api/1/lawdata/{law_id} OR https://laws.e-gov.go.jp/law/{law_id}
            target_law_id = url.split("/")[-1]
            
            # Keep sources where the extracted law_id does NOT match the target law_id
            def extract_id(source_url):
                return source_url.split("/")[-1]
                
            AGENTS_DB[agent_id].ram_sources = [
                s for s in AGENTS_DB[agent_id].ram_sources 
                if extract_id(s.url) != target_law_id
            ]
            
            if len(AGENTS_DB[agent_id].ram_sources) < original_len:
                from app.vector_store import vector_store
                vector_store.delete_by_source(agent_id, url)
                return True
        return False

class EGovService:
    @staticmethod
    async def fetch_law_data(law_id: str):
        from app.database import SessionLocal
        from app.models_db import Law
        
        with SessionLocal() as db:
            law = db.query(Law).filter(Law.law_id == law_id).first()
            if law and law.full_text:
                return {
                    "law_id": law_id,
                    "content": law.full_text,
                    "title": law.title
                }
        
        # Fallback to API V1 if not found in DB or missing full_text
        import httpx
        import xml.etree.ElementTree as ET
        
        url = f"https://laws.e-gov.go.jp/api/1/lawdata/{law_id}"
        print(f"Fallback fetch Law {law_id} from {url}...")
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(url)
                response.raise_for_status()
        except Exception as e:
            print(f"Failed to fetch {law_id}: {e}")
            raise e
            
        try:
            root = ET.fromstring(response.content)
            law_full_text = root.find(".//LawFullText")
            if law_full_text is not None:
                content = ET.tostring(law_full_text, encoding="unicode")
            else:
                content = response.text
        except Exception:
            content = response.text
            
        with SessionLocal() as db:
            law = db.query(Law).filter(Law.law_id == law_id).first()
            if law:
                law.full_text = content
                db.commit()
            else:
                # If law wasn't found initially, create a new one with full_text
                new_law = Law(law_id=law_id, title=law_id, full_text=content)
                db.add(new_law)
                db.commit()
                law = new_law # Use the newly created law for title
                
        return {
            "law_id": law_id,
            "content": content,
            "title": law.title if law else law_id
        }
