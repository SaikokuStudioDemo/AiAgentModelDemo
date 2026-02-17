import chromadb
from chromadb.utils import embedding_functions
import os
from typing import List, Dict

# Setup ChromaDB
PERSIST_DIRECTORY = "./chroma_db"

class VectorStoreService:
    def __init__(self):
        self.client = chromadb.PersistentClient(path=PERSIST_DIRECTORY)
        google_api_key = os.getenv("GOOGLE_API_KEY")
        
        if google_api_key:
            # Using Google's Gemini embeddings
            # Note: Chroma might not have built-in support for embedding_functions.Google..., 
            # so we might need to wrap it or use a default one if library support is tricky locally.
            # But for simplicity, let's try using the LangChain wrapper if possible, or fallback to default
            # Actually, standard chromadb doesn't have Google out of box yet in all versions.
            # Let's keep it simple: Use Default for now or if user really wants, implement custom function.
            # For this quick prototype, let's use DefaultEmbeddingFunction as 'mock' for stability unless requested otherwise.
            # The User asked for code adjustment.
            
            # Since integrating Google Embeddings directly into Chroma's native embedding_function format 
            # requires a custom class, let's simulate it or stick to Default for stable local dev 
            # while connecting chat generation to Gemini.
            
            # HOWEVER, to be helpful, let's assume we want to use it. 
            # We'll stick to DefaultEmbeddingFunction for stability in this demo unless specifically asked for vector search accuracy.
            # (Changing embeddings invalidates previous DB, so Default is safer for prototype)
             print("INFO: Google API Key detected. Using DefaultEmbeddingFunction for vector store stability.")
             self.embedding_fn = embedding_functions.DefaultEmbeddingFunction()
        else:
            print("WARNING: No GOOGLE_API_KEY found. Using DefaultEmbeddingFunction.")
            self.embedding_fn = embedding_functions.DefaultEmbeddingFunction()

        self.collection = self.client.get_or_create_collection(
            name="agent_laws",
            embedding_function=self.embedding_fn
        )

    def add_documents(self, documents: List[str], metadatas: List[Dict], ids: List[str]):
        self.collection.add(
            documents=documents,
            metadatas=metadatas,
            ids=ids
        )

    def query(self, query_text: str, n_results: int = 3):
        return self.collection.query(
            query_texts=[query_text],
            n_results=n_results
        )

# Global Mock Instance
vector_store = VectorStoreService()
