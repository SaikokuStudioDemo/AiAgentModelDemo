from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Agent, ChatRequest, ChatResponse
from app.services import AgentService
from app.graph import update_app, chat_app
import asyncio
import os
import re
from datetime import datetime, timedelta
from typing import Optional

# ── LawRef キャッシュ ──────────────────────────────────────────
_law_ref_pattern: Optional[re.Pattern] = None
_law_ref_map: dict = {}
_law_ref_built_at: Optional[datetime] = None
_LAW_REF_TTL = timedelta(hours=1)


def _build_law_ref_cache(db: Session):
    global _law_ref_pattern, _law_ref_map, _law_ref_built_at
    from app.models_db import Law
    rows = db.query(Law.law_id, Law.title).all()
    # 3文字以上のタイトルのみ（短すぎるとノイズになる）
    filtered = [(law_id, title) for law_id, title in rows if len(title) >= 3]
    # 長いタイトルを優先マッチさせるため降順ソート
    filtered.sort(key=lambda x: len(x[1]), reverse=True)
    _law_ref_map = {title: law_id for law_id, title in filtered}
    pattern_str = "(" + "|".join(re.escape(t) for t in _law_ref_map) + ")"
    _law_ref_pattern = re.compile(pattern_str)
    _law_ref_built_at = datetime.utcnow()


def _get_law_ref_cache(db: Session):
    global _law_ref_built_at
    if _law_ref_pattern is None or (datetime.utcnow() - _law_ref_built_at) > _LAW_REF_TTL:
        _build_law_ref_cache(db)
    return _law_ref_pattern, _law_ref_map


_ARTICLE_SUFFIX_RE = re.compile(r'(第[〇一二三四五六七八九十百千万]+条)')


def _kanji_to_int(s: str) -> int:
    """漢数字を整数に変換。例: 二十二 → 22"""
    units = {"千": 1000, "百": 100, "十": 10}
    digits = {"〇": 0, "一": 1, "二": 2, "三": 3, "四": 4,
              "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
    result, current = 0, 0
    for c in s:
        if c in digits:
            current = digits[c]
        elif c in units:
            result += (current or 1) * units[c]
            current = 0
    return result + current


def _linkify(text: str, pattern: re.Pattern, name_to_id: dict, current_law_id: str) -> str:
    """法令名（+ 任意で第X条）にクリッカブルリンクを付与する。"""
    parts = []
    last = 0
    for m in pattern.finditer(text):
        name = m.group(1)
        law_id = name_to_id.get(name)
        parts.append(text[last:m.start()])

        if law_id and law_id != current_law_id:
            # 法令名の直後に「第X条」があれば含める
            suffix_m = _ARTICLE_SUFFIX_RE.match(text, m.end())
            if suffix_m:
                article_ref = suffix_m.group(1)          # 例: 第二十二条
                kanji_num   = article_ref[1:-1]           # 二十二
                article_num = _kanji_to_int(kanji_num)
                anchor      = f"#article-{article_num}" if article_num else ""
                link_text   = name + article_ref
                end         = suffix_m.end()
            else:
                anchor    = ""
                link_text = name
                end       = m.end()

            parts.append(
                f'<a class="law-ref" data-law-id="{law_id}" data-law-name="{name}" '
                f'href="#" onclick="showPanel(\'{law_id}\',\'{name}\',\'{anchor}\');return false;">'
                f'{link_text}</a>'
            )
            last = end
        else:
            parts.append(name)
            last = m.end()

    parts.append(text[last:])
    return "".join(parts)

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
async def get_law_raw(
    law_id: str,
    db: Session = Depends(get_db),
    panel: bool = Query(False, description="パネル内表示モード（右パネル用）"),
):
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

    import xml.etree.ElementTree as ET
    from fastapi.responses import HTMLResponse, Response

    try:
        root = ET.fromstring(xml_content)

        law_title_el = root.find(".//LawTitle")
        law_title_text = law_title_el.text if law_title_el is not None else "Unknown Law"

        # LawRef キャッシュ取得（パネルモードでも同様にリンク化）
        ref_pattern, ref_map = _get_law_ref_cache(db)

        def render_articles(root_el) -> str:
            body = ""
            for article in root_el.findall(".//Article"):
                num = article.get("Num", "")
                id_attr = f' id="article-{num}"' if num else ""
                body += f"<div class='article'{id_attr}>"
                title_el = article.find("ArticleTitle")
                if title_el is not None and title_el.text:
                    body += f"<div class='article-title'>{title_el.text}</div>"
                for sentence in article.findall(".//Sentence"):
                    if sentence.text:
                        linked = _linkify(sentence.text, ref_pattern, ref_map, law_id)
                        body += f"<p>{linked}</p>"
                body += "</div>"
            return body

        articles_html = render_articles(root)

        # ── パネルモード：シンプルなHTMLのみ返す ──────────────────
        if panel:
            html = f"""<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>{law_title_text}</title>
  <style>
    body {{ font-family: sans-serif; padding: 1.5rem; line-height: 1.7; font-size: 0.9rem; color: #1a1a1a; }}
    h1 {{ font-size: 1.1rem; font-weight: bold; margin-bottom: 1rem; border-bottom: 2px solid #3b82f6; padding-bottom: 0.5rem; }}
    .article {{ margin-bottom: 1.5rem; }}
    .article-title {{ font-weight: bold; margin-bottom: 0.3rem; color: #1d4ed8; }}
    p {{ margin: 0.3rem 0; }}
    a.law-ref {{ color: #2563eb; text-decoration: underline; cursor: pointer; }}
    a.law-ref:hover {{ color: #1d4ed8; background: #eff6ff; border-radius: 2px; }}
  </style>
</head>
<body>
  <h1>{law_title_text}</h1>
  {articles_html}
  <script>
    function showPanel(lawId, lawName) {{
      // パネル内のリンクは親ウィンドウのshowPanelを呼ぶ
      if (window.parent && window.parent.showPanel) {{
        window.parent.showPanel(lawId, lawName);
      }}
    }}
  </script>
</body>
</html>"""
            return HTMLResponse(content=html, status_code=200,
                                headers={"Cache-Control": "no-store"})

        # ── フルモード：スプリットパネル付きHTML ─────────────────
        html = f"""<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>{law_title_text}</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: sans-serif; height: 100vh; display: flex; flex-direction: column; background: #f8fafc; }}

    /* ヘッダー */
    #header {{
      padding: 0.75rem 1.5rem;
      background: #1e293b;
      color: white;
      font-size: 0.95rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-shrink: 0;
    }}
    #header span {{ opacity: 0.6; font-weight: 400; font-size: 0.8rem; }}

    /* メインコンテナ */
    #container {{
      display: flex;
      flex: 1;
      overflow: hidden;
    }}

    /* 左ペイン（メイン法令） */
    #main-pane {{
      flex: 1;
      overflow-y: auto;
      padding: 2rem;
      transition: flex 0.3s ease;
    }}
    h1 {{ font-size: 1.4rem; font-weight: bold; margin-bottom: 1.5rem;
          border-bottom: 3px solid #3b82f6; padding-bottom: 0.75rem; color: #0f172a; }}
    .article {{ margin-bottom: 2rem; }}
    .article-title {{ font-weight: bold; font-size: 1rem; margin-bottom: 0.4rem; color: #1e40af; }}
    p {{ margin: 0.4rem 0; line-height: 1.8; font-size: 0.92rem; color: #1e293b; }}
    a.law-ref {{
      color: #2563eb;
      text-decoration: underline dotted;
      cursor: pointer;
      border-radius: 3px;
      padding: 0 1px;
      transition: background 0.15s;
    }}
    a.law-ref:hover {{ background: #dbeafe; text-decoration: underline; }}
    a.law-ref.active {{ background: #bfdbfe; font-weight: 600; }}

    /* 区切り線（ドラッグ対応） */
    #divider {{
      width: 5px;
      background: #e2e8f0;
      cursor: col-resize;
      flex-shrink: 0;
      transition: background 0.15s;
      display: none;
    }}
    #divider:hover, #divider.dragging {{ background: #3b82f6; }}

    /* 右ペイン（関連法令パネル） */
    #ref-pane {{
      width: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: #fff;
      border-left: none;
      transition: width 0.3s ease;
      flex-shrink: 0;
    }}
    #ref-pane.open {{
      width: 45%;
      border-left: 1px solid #e2e8f0;
    }}
    #ref-header {{
      padding: 0.75rem 1rem;
      background: #f1f5f9;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }}
    #ref-title {{ font-size: 0.85rem; font-weight: 600; color: #334155; }}
    #ref-close {{
      background: none;
      border: none;
      cursor: pointer;
      font-size: 1.1rem;
      color: #64748b;
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
    }}
    #ref-close:hover {{ background: #e2e8f0; }}
    #ref-iframe {{
      flex: 1;
      border: none;
      width: 100%;
    }}
  </style>
</head>
<body>
  <div id="header">
    {law_title_text}
    <span>— 関連法令をクリックすると右パネルに表示されます</span>
  </div>
  <div id="container">
    <div id="main-pane">
      <h1>{law_title_text}</h1>
      {articles_html}
    </div>
    <div id="divider"></div>
    <div id="ref-pane">
      <div id="ref-header">
        <span id="ref-title">関連法令</span>
        <button id="ref-close" onclick="closePanel()" title="閉じる">✕</button>
      </div>
      <iframe id="ref-iframe" src="about:blank"></iframe>
    </div>
  </div>

  <script>
    const BASE = '{"/".join(str(law_id).split("/")[:-1]) if "/" in str(law_id) else ""}';
    const refPane  = document.getElementById('ref-pane');
    const divider  = document.getElementById('divider');
    const iframe   = document.getElementById('ref-iframe');
    const refTitle = document.getElementById('ref-title');
    let activeLink = null;

    function showPanel(lawId, lawName, anchor) {{
      // アクティブリンクのスタイル更新
      if (activeLink) activeLink.classList.remove('active');
      activeLink = document.querySelector(`a[data-law-id="${{lawId}}"]`);
      if (activeLink) activeLink.classList.add('active');

      refTitle.textContent = lawName;
      iframe.src = `/api/laws/${{lawId}}/raw?panel=true${{anchor || ''}}`;
      refPane.classList.add('open');
      divider.style.display = 'block';
    }}

    function closePanel() {{
      refPane.classList.remove('open');
      divider.style.display = 'none';
      iframe.src = 'about:blank';
      if (activeLink) activeLink.classList.remove('active');
      activeLink = null;
    }}

    // ── ドラッグで幅調整 ────────────────────────────────────
    let dragging = false;
    divider.addEventListener('mousedown', e => {{
      dragging = true;
      divider.classList.add('dragging');
      e.preventDefault();
    }});
    document.addEventListener('mousemove', e => {{
      if (!dragging) return;
      const container = document.getElementById('container');
      const rect = container.getBoundingClientRect();
      const newRefWidth = rect.right - e.clientX;
      const minW = 300, maxW = rect.width * 0.7;
      refPane.style.width = Math.min(maxW, Math.max(minW, newRefWidth)) + 'px';
      refPane.style.transition = 'none';
    }});
    document.addEventListener('mouseup', () => {{
      dragging = false;
      divider.classList.remove('dragging');
      refPane.style.transition = '';
    }});
  </script>
</body>
</html>"""

        return HTMLResponse(content=html, status_code=200,
                            headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"})

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Exception parsing XML: {e}")
        from fastapi.responses import Response
        return Response(content=xml_content, media_type="text/xml")

### NTA Tax Answer endpoints ###

from app.nta_scraper import run_scrape, get_status as nta_get_status

@router.post("/nta/sync")
async def nta_sync(background_tasks: BackgroundTasks):
    """国税庁タックスアンサーのスクレイピングをバックグラウンドで実行する。"""
    from app.nta_scraper import _sync_running
    if _sync_running:
        return {"status": "already_running"}
    background_tasks.add_task(run_scrape)
    return {"status": "started"}


@router.get("/nta/status")
def nta_status():
    """取得済み件数・最終更新日時・同期中かどうかを返す。"""
    return nta_get_status()


### Knowledge Base endpoints ###

@router.get("/knowledge/laws")
def knowledge_laws(
    q: str = Query(""),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    agent_id: str = Query(""),
    db: Session = Depends(get_db),
):
    from app.models_db import Law, AgentLawMapping
    if agent_id:
        query = (
            db.query(Law)
            .join(AgentLawMapping, Law.law_id == AgentLawMapping.law_id)
            .filter(AgentLawMapping.agent_id == agent_id)
        )
    else:
        query = db.query(Law)
    if q:
        query = query.filter(Law.title.contains(q) | Law.law_num.contains(q))
    total = query.count()
    rows = query.order_by(Law.title).offset((page - 1) * limit).limit(limit).all()
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "items": [
            {
                "law_id": r.law_id,
                "title": r.title,
                "law_num": r.law_num,
                "promulgation_date": str(r.promulgation_date) if r.promulgation_date else None,
            }
            for r in rows
        ],
    }


@router.get("/knowledge/nta")
def knowledge_nta(
    q: str = Query(""),
    category: str = Query(""),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    from app.nta_scraper import _get_mongo_col
    try:
        col = _get_mongo_col()
        query: dict = {}
        if q:
            query["$or"] = [
                {"title": {"$regex": q, "$options": "i"}},
                {"content": {"$regex": q, "$options": "i"}},
            ]
        if category:
            query["category"] = category
        total = col.count_documents(query)
        items = list(
            col.find(query, {"_id": 0, "content": 0, "content_hash": 0})
            .sort("no", 1)
            .skip((page - 1) * limit)
            .limit(limit)
        )
        for item in items:
            if item.get("last_scraped_at"):
                item["last_scraped_at"] = item["last_scraped_at"].isoformat()
        categories = col.distinct("category")
        categories = [c for c in categories if c]
        return {"total": total, "page": page, "limit": limit, "items": items, "categories": sorted(categories)}
    except Exception as e:
        return {"total": 0, "page": 1, "limit": limit, "items": [], "categories": [], "error": str(e)}


@router.get("/knowledge/nta/{no}/view")
def knowledge_nta_view(no: str):
    """タックスアンサー個別コンテンツをHTMLで返す（iframe表示用）。"""
    from app.nta_scraper import _get_mongo_col
    from fastapi.responses import HTMLResponse
    try:
        col = _get_mongo_col()
        doc = col.find_one({"no": no}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Not found")
        title = doc.get("title", f"No.{no}")
        content = doc.get("content", "")
        url = doc.get("url", "")
        category = doc.get("category", "")
        # テキストを段落に分割してHTML化
        paragraphs = "".join(
            f"<p>{line}</p>" for line in content.splitlines() if line.strip()
        )
        html = f"""<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>{title}</title>
  <style>
    body {{ font-family: sans-serif; padding: 1.5rem; line-height: 1.8; font-size: 0.9rem; color: #1a1a1a; max-width: 860px; margin: 0 auto; }}
    .meta {{ font-size: 0.75rem; color: #64748b; margin-bottom: 1.2rem; display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; }}
    .category {{ background: #e0f2fe; color: #0369a1; padding: 0.15rem 0.6rem; border-radius: 999px; font-weight: 600; }}
    h1 {{ font-size: 1.15rem; font-weight: bold; margin-bottom: 0.6rem; border-bottom: 2px solid #3b82f6; padding-bottom: 0.5rem; }}
    p {{ margin: 0.4rem 0; }}
    a {{ color: #2563eb; }}
  </style>
</head>
<body>
  <div class="meta">
    <span class="category">{category}</span>
    <span>No.{no}</span>
    {"<a href='" + url + "' target='_blank'>国税庁サイトで開く ↗</a>" if url else ""}
  </div>
  <h1>{title}</h1>
  {paragraphs}
</body>
</html>"""
        return HTMLResponse(content=html, status_code=200, headers={"Cache-Control": "no-store"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


### Sync Manager endpoints ###

@router.get("/sync/status")
def sync_status(db: Session = Depends(get_db)):
    """全データソースの同期状況・スケジュール情報を返す。"""
    from app.sync_manager import get_job_next_run, get_scheduler_running
    from app.nta_scraper import get_status as nta_get_status
    from app.sync_tasks import SYNC_STATUS
    from app.models_db import Law

    # 法令の最終更新日
    latest_law = db.query(Law.last_synced_at).order_by(Law.last_synced_at.desc()).first()
    law_last_synced = latest_law[0].isoformat() if latest_law and latest_law[0] else None
    law_count = db.query(Law).count()

    # NTA ステータス
    nta = nta_get_status()
    nta_last_updated = nta.get("last_updated_at")
    nta_last_str = nta_last_updated.isoformat() if nta_last_updated else None

    scheduler_running = get_scheduler_running()

    sources = [
        {
            "id": "egov_laws",
            "name": "法令",
            "source": "e-Gov（電子政府総合窓口）",
            "description": "日本の法令全文データベース。e-Gov API から取得・同期。",
            "record_count": law_count,
            "last_synced_at": law_last_synced,
            "next_run_at": get_job_next_run("egov_daily"),
            "schedule_description": "毎日 2:00 AM",
            "job_id": "egov_daily",
            "is_running": SYNC_STATUS.get("is_syncing", False),
            "run_progress": {
                "current": SYNC_STATUS.get("current", 0),
                "total": SYNC_STATUS.get("total", 0),
                "message": SYNC_STATUS.get("message", ""),
                "eta_seconds": SYNC_STATUS.get("eta_seconds"),
            } if SYNC_STATUS.get("is_syncing") else None,
            "scheduler_active": scheduler_running,
        },
        {
            "id": "nta_taxanswer",
            "name": "タックスアンサー",
            "source": "国税庁",
            "description": "国税庁タックスアンサーのFAQページを収集・ベクトル化。",
            "record_count": nta.get("count", 0),
            "last_synced_at": nta_last_str,
            "next_run_at": get_job_next_run("nta_weekly"),
            "schedule_description": "毎週月曜 2:00 AM",
            "job_id": "nta_weekly",
            "is_running": nta.get("syncing", False),
            "run_progress": None,
            "scheduler_active": scheduler_running,
        },
    ]
    return {"sources": sources, "scheduler_active": scheduler_running}


class SyncTriggerRequest(BaseModel):
    mode: str = "incremental"  # "incremental" | "full"

@router.post("/sync/trigger/{source_id}")
async def sync_trigger(source_id: str, background_tasks: BackgroundTasks, request: SyncTriggerRequest = SyncTriggerRequest()):
    """指定ソースの同期を即時実行する。mode: incremental（デフォルト）| full"""
    if source_id == "egov_laws":
        from app.sync_tasks import SYNC_STATUS, start_sync_background
        if SYNC_STATUS.get("is_syncing"):
            return {"status": "already_running"}
        background_tasks.add_task(start_sync_background, request.mode)
        return {"status": "started", "mode": request.mode}
    elif source_id == "nta_taxanswer":
        from app.nta_scraper import run_scrape, _sync_running
        if _sync_running:
            return {"status": "already_running"}
        background_tasks.add_task(run_scrape)
        return {"status": "started", "mode": "incremental"}
    else:
        raise HTTPException(status_code=404, detail=f"Unknown source: {source_id}")


### Chat endpoint ###

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    history_dicts = [{"role": h.role, "content": h.content} for h in request.history]
    inputs = {"question": request.message, "agent_id": request.agent_id, "model": request.model, "history": history_dicts, "context": [], "answer": ""}
    result = await chat_app.ainvoke(inputs)
    return ChatResponse(
        response=result["answer"],
        source_nodes=["retrieve", "generate"]
    )
