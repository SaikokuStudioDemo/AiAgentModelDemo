import os
from motor.motor_asyncio import AsyncIOMotorClient

_client: AsyncIOMotorClient = None

def get_database():
    global _client
    if _client is None:
        uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        _client = AsyncIOMotorClient(uri)
    return _client["saikoku"]

async def create_indexes():
    db = get_database()
    await db["chat_sessions"].create_index([("user_id", 1), ("updated_at", -1)])
    await db["chat_sessions"].create_index([("corporate_id", 1)])
