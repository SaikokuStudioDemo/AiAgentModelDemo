import asyncio
import hashlib
import os
from datetime import datetime
from typing import Optional
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup
from pymongo import MongoClient

BASE_URL = "https://www.nta.go.jp"
INDEX_URL = "https://www.nta.go.jp/taxes/shiraberu/taxanswer/code/index.htm"
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DB_NAME = "saikoku"
COLLECTION_NAME = "nta_faq"
CHROMA_COLLECTION = "nta_faq_vectors"

# In-process sync state
_sync_running = False
_last_synced_at: Optional[datetime] = None


def _get_mongo_col():
    client = MongoClient(MONGODB_URI)
    col = client[DB_NAME][COLLECTION_NAME]
    col.create_index("no", unique=True)
    return col


def _get_chroma_col():
    import chromadb
    from chromadb.utils import embedding_functions

    client = chromadb.PersistentClient(path="./chroma_db")
    ef = embedding_functions.DefaultEmbeddingFunction()
    return client.get_or_create_collection(
        name=CHROMA_COLLECTION,
        embedding_function=ef,
    )


async def _fetch_faq_urls() -> list[dict]:
    """カテゴリ一覧ページから FAQ 個別ページの URL を全件収集する。"""
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        resp = await client.get(INDEX_URL)
        resp.raise_for_status()

    soup = BeautifulSoup(resp.content, "html.parser")  # contentで文字コード自動判定

    results = []
    seen: set[str] = set()

    # カテゴリブロックごとにリンクを収集
    for section in soup.find_all(["div", "section", "li"]):
        heading = section.find(["h2", "h3", "h4", "dt"])
        category = heading.get_text(strip=True) if heading else ""

        for a in section.find_all("a", href=True):
            href: str = a["href"]
            if "/taxanswer/" in href and href.endswith(".htm") and "index" not in href:
                url = urljoin(BASE_URL, href)
                if url not in seen:
                    seen.add(url)
                    results.append({"url": url, "category": category})

    # フォールバック：構造解析で拾えなかった場合
    if not results:
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "/taxanswer/" in href and href.endswith(".htm") and "index" not in href:
                url = urljoin(BASE_URL, href)
                if url not in seen:
                    seen.add(url)
                    results.append({"url": url, "category": ""})

    return results


async def _fetch_faq_page(
    client: httpx.AsyncClient, url: str, category: str
) -> Optional[dict]:
    """FAQ 個別ページを取得してパースする。"""
    try:
        resp = await client.get(url)
        resp.raise_for_status()
    except Exception as e:
        print(f"[nta_scraper] fetch error {url}: {e}")
        return None

    soup = BeautifulSoup(resp.content, "html.parser")  # contentで文字コード自動判定

    # No は URL の末尾ファイル名から取得（例: 1200.htm → "1200"）
    no = url.rstrip("/").split("/")[-1].replace(".htm", "")

    # タイトル
    title = ""
    for tag in ["h1", "h2"]:
        el = soup.find(tag)
        if el:
            title = el.get_text(strip=True)
            break
    if not title:
        title_tag = soup.find("title")
        title = title_tag.get_text(strip=True) if title_tag else ""

    # 本文テキスト：bodyArea からパンくず・フィードバック等を除去して抽出
    content_el = soup.find("div", id="bodyArea") or soup.find("div", class_="left-content")
    if content_el:
        # ノイズ要素を除去
        for noise in content_el.select(
            "ol.breadcrumb, div.contents-feedback, div#page-top p.skip, "
            "p.skip, div#footer, div#navi-Accordion"
        ):
            noise.decompose()
        content = content_el.get_text(separator="\n", strip=True)
        # 先頭の定型ナビゲーション行（「ホーム」「税の情報...」等）をスキップ
        lines = content.splitlines()
        start = 0
        for i, line in enumerate(lines):
            if line.startswith("No.") or (title and line.startswith(title[:10])):
                start = i
                break
        content = "\n".join(lines[start:]).strip()
    else:
        body = soup.find("body")
        content = body.get_text(separator="\n", strip=True) if body else ""

    content_hash = hashlib.md5(content.encode("utf-8")).hexdigest()

    return {
        "no": no,
        "title": title,
        "category": category,
        "url": url,
        "content": content,
        "content_hash": content_hash,
        "last_scraped_at": datetime.utcnow(),
    }


async def run_scrape() -> dict:
    """スクレイピングのメイン処理。バックグラウンドから呼び出す。"""
    global _sync_running, _last_synced_at

    if _sync_running:
        return {"status": "already_running"}

    _sync_running = True
    stats = {"total": 0, "updated": 0, "skipped": 0, "errors": 0}

    try:
        print("[nta_scraper] Starting scrape...")
        faq_links = await _fetch_faq_urls()
        print(f"[nta_scraper] Found {len(faq_links)} FAQ pages")

        mongo_col = _get_mongo_col()
        chroma_col = _get_chroma_col()

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            for link in faq_links:
                stats["total"] += 1

                doc = await _fetch_faq_page(client, link["url"], link["category"])
                if doc is None:
                    stats["errors"] += 1
                    await asyncio.sleep(0.5)
                    continue

                # content_hash で変更検知
                existing = mongo_col.find_one(
                    {"no": doc["no"]}, {"content_hash": 1}
                )
                if existing and existing.get("content_hash") == doc["content_hash"]:
                    stats["skipped"] += 1
                    await asyncio.sleep(0.5)
                    continue

                # MongoDB に upsert
                mongo_col.update_one(
                    {"no": doc["no"]},
                    {"$set": doc},
                    upsert=True,
                )

                # ChromaDB に upsert（変更があったものだけ再埋め込み）
                chroma_col.upsert(
                    ids=[f"nta_faq_{doc['no']}"],
                    documents=[doc["content"]],
                    metadatas=[{
                        "source": "nta_taxanswer",
                        "no": doc["no"],
                        "category": doc["category"],
                        "title": doc["title"],
                        "url": doc["url"],
                    }],
                )

                stats["updated"] += 1
                print(f"[nta_scraper] Updated No.{doc['no']}: {doc['title']}")

                # 国税庁サーバーへの負荷軽減
                await asyncio.sleep(0.5)

        _last_synced_at = datetime.utcnow()
        print(f"[nta_scraper] Done: {stats}")

    except Exception as e:
        print(f"[nta_scraper] Error: {e}")
        raise
    finally:
        _sync_running = False

    return stats


def get_status() -> dict:
    """現在の取得状況を返す。"""
    try:
        mongo_col = _get_mongo_col()
        count = mongo_col.count_documents({})
        latest = mongo_col.find_one(
            {}, sort=[("last_scraped_at", -1)], projection={"last_scraped_at": 1}
        )
        last_updated = latest["last_scraped_at"] if latest else None
    except Exception:
        count = 0
        last_updated = None

    return {
        "count": count,
        "last_synced_at": _last_synced_at,
        "last_updated_at": last_updated,
        "syncing": _sync_running,
    }
