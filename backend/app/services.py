import asyncio
from datetime import datetime, timedelta
from typing import List, Dict
from app.models import Agent, RAMStatus, AgentType

# Mock In-Memory Database
AGENTS_DB: Dict[str, Agent] = {
    "tax_01": Agent(
        id="tax_01",
        name="Tax Agent Alpha",
        type=AgentType.TAX,
        description="Specializes in Japanese Tax Law (Income Tax, Corporate Tax).",
        ram_status=RAMStatus(
            last_updated=datetime.now() - timedelta(days=1),
            next_update_scheduled=datetime.now() + timedelta(hours=12),
            status="Idle",
            doc_count=150,
            source_url="https://laws.e-gov.go.jp/law/340AC0000000033"
        )
    ),
    "labor_01": Agent(
        id="labor_01",
        name="Labor Agent Beta",
        type=AgentType.LABOR,
        description="Expert in Labor Standards Act and workplace regulations.",
        ram_status=RAMStatus(
            last_updated=datetime.now() - timedelta(hours=5),
            next_update_scheduled=datetime.now() + timedelta(days=2),
            status="Idle",
            doc_count=85,
            source_url="https://laws.e-gov.go.jp/law/322AC0000000049"
        )
    )
}

class AgentService:
    @staticmethod
    def get_all_agents() -> List[Agent]:
        return list(AGENTS_DB.values())

    @staticmethod
    def get_agent(agent_id: str) -> Agent:
        return AGENTS_DB.get(agent_id)

    @staticmethod
    def update_agent_status(agent_id: str, status: str):
        if agent_id in AGENTS_DB:
            AGENTS_DB[agent_id].ram_status.status = status
            if status == "Updated":
                AGENTS_DB[agent_id].ram_status.last_updated = datetime.now()
                AGENTS_DB[agent_id].ram_status.status = "Idle"

class EGovService:
    @staticmethod
    async def fetch_law_data(law_id: str):
        # 1. Fetch from e-Gov API
        # Note: In real production, use a proper async client like httpx, but requests is fine for this prototype
        # since we are running in a thread or just assuming low concurrency for now.
        # However, to be async-friendly in FastAPI, let's wrap it or just use run_in_executor if needed.
        # For simplicity in this demo (and since we import requests), we'll do a blocking call (not ideal for high load but ok here).
        import requests
        import xml.etree.ElementTree as ET
        import os

        # Strip version suffix if present (e.g. if ID has extra data) - usually ID is fixed length
        # API URL: https://laws.e-gov.go.jp/api/1/lawdata/{law_id}
        url = f"https://laws.e-gov.go.jp/api/1/lawdata/{law_id}"
        
        print(f"Fetching Law {law_id} from {url}...")
        try:
            # Run in thread to not block main loop
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(None, requests.get, url)
            response.raise_for_status()
            
            # 2. Save Raw XML
            os.makedirs("data/raw", exist_ok=True)
            file_path = f"data/raw/{law_id}.xml"
            with open(file_path, "wb") as f:
                f.write(response.content)
            print(f"Saved raw XML to {file_path}")

            # 3. Parse XML
            root = ET.fromstring(response.content)
            
            # Extract Law Title
            law_title = "Unknown Law"
            law_num = root.find(".//LawNum")
            if law_num is not None:
                law_title = law_num.text
            
            # Extract Content (Articles)
            # We will concat all text for now, but in reality we should chunk by Article
            full_content = ""
            articles = root.findall(".//Article")
            if not articles:
                 # Fallback if no Article tags (rare for laws, but possible for cabinets orders etc via different tags)
                 # Just get all text
                 full_content = "".join(root.itertext())
            else:
                content_list = []
                for article in articles:
                    title = article.find("ArticleTitle")
                    title_text = title.text if title is not None else ""
                    
                    sentences = []
                    for sentence in article.findall(".//ParagraphSentence/Sentence"):
                        if sentence.text:
                            sentences.append(sentence.text)
                    
                    article_text = f"{title_text}\n" + "\n".join(sentences)
                    content_list.append(article_text)
                
                full_content = "\n\n".join(content_list)

            return {
                "law_id": law_id,
                "title": law_title,
                "content": full_content
            }

        except Exception as e:
            print(f"Error fetching law {law_id}: {e}")
            # Fallback to mock on error so app doesn't crash
            return {
                "law_id": law_id,
                "title": f"Error loading {law_id}",
                "content": f"Failed to fetch data: {str(e)}"
            }
