import os
import sys

# Add the backend directory to sys.path so we can import app modules
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, backend_dir)

from app.database import SessionLocal
from app.models_db import AgentLawMapping
from app.services import AGENTS_DB

def clean_orphaned_mappings():
    db = SessionLocal()
    mappings = db.query(AgentLawMapping).all()
    
    print(f"Found {len(mappings)} mappings in SQLite.")
    
    deleted_count = 0
    for m in mappings:
        agent = AGENTS_DB.get(m.agent_id)
        if not agent:
            print(f"Deleting mapping for unknown agent {m.agent_id}")
            db.delete(m)
            deleted_count += 1
            continue
            
        # Check if the law exists in the agent's RAM sources
        expected_url = f"https://laws.e-gov.go.jp/api/2/laws/{m.law_id}/xml"
        source_exists = any(source.url == expected_url for source in agent.ram_sources)
        
        if not source_exists and m.status != "Pending":
            print(f"Deleting orphaned mapping for Agent: {m.agent_id}, Law: {m.law_id}")
            db.delete(m)
            deleted_count += 1
    
    db.commit()
    db.close()
    print(f"Deleted {deleted_count} orphaned mappings.")

if __name__ == "__main__":
    clean_orphaned_mappings()
