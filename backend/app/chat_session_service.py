from datetime import datetime, timezone, timedelta
from app.db.mongodb import get_database

JST = timezone(timedelta(hours=9))

MESSAGES_PER_PAGE = 20
AI_HISTORY_LIMIT = 20

class ChatSessionService:

    @staticmethod
    async def get_or_create_session(user_id: str, agent_id: str) -> str:
        """
        user_id + agent_id の組み合わせで本日のセッションを取得、
        なければ新規作成してsession_idを返す。
        """
        db = get_database()
        today_jst = datetime.now(JST).replace(hour=0, minute=0, second=0, microsecond=0)
        today = today_jst.astimezone(timezone.utc).replace(tzinfo=None)
        session = await db["chat_sessions"].find_one({
            "user_id": user_id,
            "agent_id": agent_id,
            "created_at": {"$gte": today}
        })
        if session:
            return str(session["_id"])

        from bson import ObjectId
        new_session = {
            "_id": ObjectId(),
            "user_id": user_id,
            "agent_id": agent_id,
            "messages": [],
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        await db["chat_sessions"].insert_one(new_session)
        return str(new_session["_id"])

    @staticmethod
    async def append_message(session_id: str, role: str, content: str):
        """メッセージをセッションに追記する。"""
        from bson import ObjectId
        db = get_database()
        message = {
            "role": role,
            "content": content,
            "timestamp": datetime.utcnow()
        }
        await db["chat_sessions"].update_one(
            {"_id": ObjectId(session_id)},
            {
                "$push": {"messages": message},
                "$set": {"updated_at": datetime.utcnow()}
            }
        )

    @staticmethod
    async def get_recent_messages_for_ai(session_id: str) -> list:
        """AIに渡す直近AI_HISTORY_LIMIT件のメッセージを返す。"""
        from bson import ObjectId
        db = get_database()
        session = await db["chat_sessions"].find_one(
            {"_id": ObjectId(session_id)},
            {"messages": {"$slice": -AI_HISTORY_LIMIT}}
        )
        if not session:
            return []
        return [
            {"role": m["role"], "content": m["content"]}
            for m in session.get("messages", [])
        ]

    @staticmethod
    async def get_messages_paginated(session_id: str, page: int = 1) -> list:
        """表示用：ページネーションでメッセージを返す（古い順、20件単位）。"""
        from bson import ObjectId
        db = get_database()
        session = await db["chat_sessions"].find_one(
            {"_id": ObjectId(session_id)},
            {"messages": 1}
        )
        if not session:
            return []
        messages = session.get("messages", [])
        # 古い順に並んでいる前提でページネーション
        total = len(messages)
        start = max(0, total - page * MESSAGES_PER_PAGE)
        end = total - (page - 1) * MESSAGES_PER_PAGE
        return messages[start:end]

    @staticmethod
    async def get_sessions(user_id: str, agent_id: str) -> list:
        """ユーザーの過去セッション一覧を新しい順で返す。"""
        db = get_database()
        cursor = db["chat_sessions"].find(
            {"user_id": user_id, "agent_id": agent_id},
            {"messages": 0}
        ).sort("updated_at", -1).limit(50)
        sessions = await cursor.to_list(length=50)
        return [
            {
                "session_id": str(s["_id"]),
                "created_at": s["created_at"],
                "updated_at": s["updated_at"],
            }
            for s in sessions
        ]
