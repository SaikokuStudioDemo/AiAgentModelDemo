from typing import TypedDict, Annotated, List
from langgraph.graph import StateGraph, END
from app.services import EGovService, AgentService
from app.vector_store import vector_store
import asyncio
import os
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

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

def retrieve(state: ChatState):
    print(f"Retrieving context for {state['question']}")
    results = vector_store.query(state['question'])
    # Extract documents from results
    docs = results['documents'][0] if results['documents'] else []
    return {"context": docs}

async def generate_answer(state: ChatState):
    context_str = "\n".join(state['context'])
    
    google_api_key = os.getenv("GOOGLE_API_KEY")
    if not google_api_key:
        return {"answer": f"[Mock] Based on {state['agent_id']}'s knowledge:\n{context_str}\n\n(No Google API Key found. Using Mock response.)"}

    model_name = state.get('model', 'gemini-2.5-flash-lite')
    llm = ChatGoogleGenerativeAI(model=model_name, google_api_key=google_api_key)
    
    messages = [
        SystemMessage(content=f"You are {state['agent_id']}, a specialized AI agent. Answer based on the following context:\n\n{context_str}")
    ]
    
    for msg in state.get('history', []):
        if msg['role'] == 'user':
            messages.append(HumanMessage(content=msg['content']))
        elif msg['role'] == 'assistant':
            messages.append(AIMessage(content=msg['content']))
            
    messages.append(HumanMessage(content=state['question']))
    
    response = await llm.ainvoke(messages)
    return {"answer": response.content}

chat_workflow = StateGraph(ChatState)
chat_workflow.add_node("retrieve", retrieve)
chat_workflow.add_node("generate", generate_answer)

chat_workflow.set_entry_point("retrieve")
chat_workflow.add_edge("retrieve", "generate")
chat_workflow.add_edge("generate", END)

chat_app = chat_workflow.compile()

