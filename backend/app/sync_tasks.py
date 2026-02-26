import httpx
from datetime import datetime
import time
import asyncio
import xml.etree.ElementTree as ET
from app.database import SessionLocal
from app.models_db import Law, AgentLawMapping
from sqlalchemy.dialects.sqlite import insert

EGOV_API_BASE = "https://laws.e-gov.go.jp/api/2/laws"

SYNC_STATUS = {
    "is_syncing": False,
    "mode": None,
    "current": 0,
    "total": 0,
    "start_time": None,
    "eta_seconds": None,
    "message": ""
}

def update_status(current, total, msg=""):
    SYNC_STATUS["current"] = current
    SYNC_STATUS["total"] = total
    SYNC_STATUS["message"] = msg
    if SYNC_STATUS["start_time"] and current > 0:
        elapsed = time.time() - SYNC_STATUS["start_time"]
        avg_time = elapsed / current
        remaining = total - current
        SYNC_STATUS["eta_seconds"] = int(avg_time * remaining)

async def download_full_text(client, law_id):
    url = f"https://laws.e-gov.go.jp/api/1/lawdata/{law_id}"
    try:
        response = await client.get(url)
        if response.status_code == 200:
            root = ET.fromstring(response.content)
            law_full_text = root.find(".//LawFullText")
            if law_full_text is not None:
                return ET.tostring(law_full_text, encoding="unicode")
    except Exception as e:
        print(f"Error fetching full text for {law_id}: {e}")
    return None

async def run_sync(mode="incremental"):
    if SYNC_STATUS["is_syncing"]:
        return
        
    SYNC_STATUS.update({
        "is_syncing": True,
        "mode": mode,
        "current": 0,
        "total": 0,
        "start_time": time.time(),
        "eta_seconds": None,
        "message": "Initializing sync..."
    })
    
    try:
        with SessionLocal() as db_session:
            if mode == "full":
                # Clear all full text
                SYNC_STATUS["message"] = "Clearing existing full text cache..."
                from sqlalchemy import text
                db_session.execute(text("UPDATE laws SET full_text = NULL"))
                db_session.commit()
            
            existing_laws = {row.law_id: row.law_revision_id for row in db_session.query(Law.law_id, Law.law_revision_id).all()}
            
            # Step 1: Fetch list to know total
            SYNC_STATUS["message"] = "Fetching metadata..."
            all_laws = []
            url = f"{EGOV_API_BASE}?limit=1000"
            async with httpx.AsyncClient(timeout=60.0) as client:
                while url:
                    resp = await client.get(url)
                    if resp.status_code != 200:
                        break
                    data = resp.json()
                    laws_list = data.get("laws", [])
                    all_laws.extend(laws_list)
                    next_offset = data.get("next_offset")
                    url = f"{EGOV_API_BASE}?limit=1000&offset={next_offset}" if next_offset else None
            
            SYNC_STATUS["total"] = len(all_laws)
            
            # Step 2: Iterate and update (Upsert)
            SYNC_STATUS["message"] = "Syncing local database..."
            
            async with httpx.AsyncClient(timeout=60.0) as client:
                for idx, wrapper in enumerate(all_laws):
                    # We add sleep to avoid hitting eGov rate limits on full download
                    if mode == "full":
                        await asyncio.sleep(0.3)
                    
                    update_status(idx + 1, len(all_laws), f"Processing {idx + 1}/{len(all_laws)}...")
                    
                    item = wrapper.get("law_info", {})
                    law_id = item.get("law_id")
                    if not law_id: continue
                    
                    law_num = item.get("law_num")
                    current_rev = wrapper.get("current_revision_info", {})
                    title = current_rev.get("law_title", law_id)
                    law_revision_id = current_rev.get("law_revision_id")
                    
                    promulgation_date = None
                    p_date_str = item.get("promulgation_date")
                    if p_date_str and len(p_date_str) >= 10:
                        try:
                            promulgation_date = datetime.strptime(p_date_str[:10], "%Y-%m-%d").date()
                        except ValueError: pass
                    
                    old_rev = existing_laws.get(law_id)
                    
                    full_text = None
                    needs_full_text = False
                    
                    if mode == "full":
                        needs_full_text = True
                    elif mode == "incremental" and old_rev != law_revision_id:
                        needs_full_text = True
                        print(f"Update detected for {law_id}. Will fetch full text.")
                        # Flag mappings
                        db_session.query(AgentLawMapping).filter(AgentLawMapping.law_id == law_id).update({"status": "Pending"})
                    
                    if needs_full_text:
                        full_text = await download_full_text(client, law_id)
                    
                    stmt = insert(Law).values(
                        law_id=law_id,
                        law_num=law_num,
                        title=title,
                        promulgation_date=promulgation_date,
                        law_revision_id=law_revision_id,
                        full_text=full_text
                    )
                    
                    set_dict = dict(
                        law_num=stmt.excluded.law_num,
                        title=stmt.excluded.title,
                        promulgation_date=stmt.excluded.promulgation_date,
                        law_revision_id=stmt.excluded.law_revision_id,
                        last_synced_at=datetime.utcnow()
                    )
                    
                    if full_text is not None:
                        set_dict["full_text"] = stmt.excluded.full_text
                        
                    stmt = stmt.on_conflict_do_update(
                        index_elements=['law_id'],
                        set_=set_dict
                    )
                    db_session.execute(stmt)
                    
                    # Heuristic mappings
                    keywords_map = {
                        "tax_01": ["税", "申告", "国税", "地方税"], "labor_01": ["労働", "雇用", "賃金", "就業"]
                    }
                    for agent_id, keywords in keywords_map.items():
                        if any(kw in title for kw in keywords):
                            existing = db_session.query(AgentLawMapping).filter(AgentLawMapping.agent_id == agent_id, AgentLawMapping.law_id == law_id).first()
                            if not existing:
                                db_session.add(AgentLawMapping(agent_id=agent_id, law_id=law_id, status="Pending"))
                    
                    # Commit every 50 to not block DB
                    if idx % 50 == 0:
                        db_session.commit()
                        
                db_session.commit()
                
    except Exception as e:
        print(f"Sync failed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        SYNC_STATUS.update({
            "is_syncing": False,
            "message": "Sync complete.",
            "eta_seconds": 0
        })

def start_sync_background(mode="incremental"):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(run_sync(mode))
    loop.close()
