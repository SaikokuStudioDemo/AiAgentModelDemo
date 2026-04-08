from typing import TypedDict, Annotated, List
from langgraph.graph import StateGraph, END
from app.services import EGovService, AgentService
from app.vector_store import vector_store
import asyncio
import os
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from anthropic import RateLimitError, AuthenticationError, APIError, InternalServerError, APITimeoutError

# --- RAM Update Graph ---

class UpdateState(TypedDict):
    agent_id: str
    law_id: str
    raw_content: str
    parsed_chunks: List[str]
    status: str
    url: str
    title: str

async def fetch_law(state: UpdateState):
    print(f"Fetching law for {state['agent_id']}...")
    # Simulate fetch
    data = await EGovService.fetch_law_data(state['law_id'])
    return {"raw_content": data["content"], "status": "Fetched"}

def parse_law(state: UpdateState):
    print(f"Parsing content...")
    content = state['raw_content']
    chunks = [content[i:i+100] for i in range(0, len(content), 100)]
            
    return {"parsed_chunks": chunks, "status": "Parsed", "title": state.get('title')}

def save_to_db(state: UpdateState):
    print(f"Saving to Vector DB...")
    chunks = state['parsed_chunks']
    ids = [f"{state['agent_id']}_{i}" for i in range(len(chunks))]
    metadatas = [{"agent_id": state['agent_id'], "source": state.get('url', 'e-Gov')} for _ in chunks]
    
    vector_store.add_documents(documents=chunks, metadatas=metadatas, ids=ids)
    
    # Update Agent Status in Service
    if 'url' in state:
        doc_count = max(1, len(chunks))
        title = state.get('title')
        AgentService.update_source_status(state['agent_id'], state['url'], "Updated", doc_count, title)
    
    return {"status": "Complete"}

# Build Graph
workflow = StateGraph(UpdateState)
workflow.add_node("fetch", fetch_law)
workflow.add_node("parse", parse_law)
workflow.add_node("save", save_to_db)

workflow.set_entry_point("fetch")
workflow.add_edge("fetch", "parse")
workflow.add_edge("parse", "save")
workflow.add_edge("save", END)

update_app = workflow.compile()

# --- Chat Graph (Simple RAG) ---
class ChatState(TypedDict):
    question: str
    agent_id: str
    model: str
    history: List[dict]
    context: List[str]
    answer: str
    source_refs: List[dict]

def _fetch_nta_by_no(no: str) -> list[str]:
    """MongoDBからNo.直接検索する。"""
    try:
        from pymongo import MongoClient
        import os
        client = MongoClient(os.getenv("MONGODB_URI", "mongodb://localhost:27017"))
        col = client["saikoku"]["nta_faq"]
        doc = col.find_one({"no": no}, {"content": 1, "title": 1, "url": 1})
        if doc:
            header = f"No.{no} {doc.get('title', '')} ({doc.get('url', '')})"
            return [header + "\n" + doc.get("content", "")]
    except Exception as e:
        print(f"[retrieve] NTA MongoDB direct lookup failed: {e}")
    return []


def retrieve(state: ChatState):
    import re
    print(f"Retrieving context for {state['question']}")
    # e-Gov law chunks
    results = vector_store.query(state['question'])
    docs = results['documents'][0] if results['documents'] else []

    # NTA FAQ: No.XXXX が質問に含まれる場合はMongoDB直接検索を優先
    direct_docs = []
    for match in re.finditer(r'[Nn][Oo][.\s。]?\s*(\d{3,5})', state['question']):
        no = match.group(1)
        fetched = _fetch_nta_by_no(no)
        if fetched:
            print(f"[retrieve] NTA direct hit: No.{no}")
            direct_docs.extend(fetched)

    # NTA FAQ vectors (ベクトル検索)
    try:
        import chromadb
        from chromadb.utils import embedding_functions
        nta_client = chromadb.PersistentClient(path="./chroma_db")
        ef = embedding_functions.DefaultEmbeddingFunction()
        nta_col = nta_client.get_or_create_collection(
            name="nta_faq_vectors", embedding_function=ef
        )
        nta_results = nta_col.query(query_texts=[state['question']], n_results=3)
        nta_docs = nta_results['documents'][0] if nta_results['documents'] else []
        docs = docs + direct_docs + nta_docs

        # NTA FAQのみ source_refs に含める
        source_refs = []
        seen = set()
        nta_metas = nta_results['metadatas'][0] if nta_results.get('metadatas') else []
        for meta in nta_metas:
            no = meta.get('no')
            if no and no not in seen:
                seen.add(no)
                source_refs.append({
                    "type": "nta_faq",
                    "id": no,
                    "title": meta.get('title', f"No.{no}")
                })
    except Exception as e:
        print(f"[retrieve] NTA FAQ query failed: {e}")
        docs = docs + direct_docs
        source_refs = []

    return {"context": docs, "source_refs": source_refs}

async def generate_answer(state: ChatState):
    context_str = "\n".join(state['context'])
    
    anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
    if not anthropic_api_key:
        return {"answer": f"[Mock] Based on {state['agent_id']}'s knowledge:\n{context_str}\n\n(No Anthropic API Key found. Using Mock response.)"}

    DEFAULT_MODEL = os.getenv("DEFAULT_AI_MODEL", "claude-sonnet-4-6")
    model_name = state.get('model') or DEFAULT_MODEL
    llm = ChatAnthropic(model=model_name, api_key=anthropic_api_key)
    
    messages = [
        SystemMessage(content=f"""あなたは税務・法令の専門AIアドバイザーです。
以下の法令Q&AおよびタックスアンサーのFAQを参照して、お客様のご質問にお答えください。

該当する情報が見つからない場合は、「法令Q&AおよびタックスアンサーのFAQには、該当する情報が見つかりませんでした。」と回答してください。

【参照法令の明示ルール】
回答の末尾に、参照した法令名を必ず以下の形式でリストアップしてください。参照した法令がない場合はこのセクションを省略してください。
【参照法令】所得税法、法人税法（例）

【相談先の案内ルール】
- 一般的な相談先として案内する場合は、税理士または公認会計士への相談を推奨してください。
- 「国税局電話相談センター」は、確定申告・税務調査・申告書の書き方など、税務手続きに直接関わる質問の場合のみ案内してください。それ以外の質問では案内不要です。

【参照情報】
{context_str}""")
    ]
    
    for msg in state.get('history', []):
        if msg['role'] == 'user':
            messages.append(HumanMessage(content=msg['content']))
        elif msg['role'] == 'assistant':
            messages.append(AIMessage(content=msg['content']))
            
    messages.append(HumanMessage(content=state['question']))
    
    try:
        response = await llm.ainvoke(messages)
        return {"answer": response.content, "source_refs": state.get("source_refs", [])}
    except InternalServerError as e:
        if "overloaded" in str(e).lower():
            print("[generate_answer] Anthropic overloaded (529)")
            return {"answer": "現在AIサーバーが混み合っています。少し時間をおいて再度お試しください。", "source_refs": []}
        print(f"[generate_answer] Anthropic internal server error: {e}")
        return {"answer": "AIサービスで一時的な問題が発生しています。しばらくお待ちください。", "source_refs": []}
    except RateLimitError:
        print("[generate_answer] Anthropic rate limit (429)")
        return {"answer": "リクエストが集中しています。しばらくお待ちください。", "source_refs": []}
    except AuthenticationError:
        print("[generate_answer] Anthropic authentication error (401)")
        return {"answer": "認証エラーが発生しました。管理者にお問い合わせください。", "source_refs": []}
    except APITimeoutError:
        print("[generate_answer] Anthropic API timeout")
        return {"answer": "応答がタイムアウトしました。再度お試しください。", "source_refs": []}
    except APIError as e:
        print(f"[generate_answer] Anthropic API error: {e}")
        return {"answer": "AIサービスで一時的な問題が発生しています。しばらくお待ちください。", "source_refs": []}
    except asyncio.TimeoutError:
        print("[generate_answer] Request timed out")
        return {"answer": "応答がタイムアウトしました。再度お試しください。", "source_refs": []}
    except Exception as e:
        print(f"[generate_answer] Unexpected error: {e}")
        return {"answer": "申し訳ありません。回答の生成中に予期しないエラーが発生しました。しばらく待ってから再度お試しください。", "source_refs": []}

chat_workflow = StateGraph(ChatState)
chat_workflow.add_node("retrieve", retrieve)
chat_workflow.add_node("generate", generate_answer)

chat_workflow.set_entry_point("retrieve")
chat_workflow.add_edge("retrieve", "generate")
chat_workflow.add_edge("generate", END)

chat_app = chat_workflow.compile()

