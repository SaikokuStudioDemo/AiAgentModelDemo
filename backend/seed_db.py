import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "saikoku.db")
SEED_PATH = os.path.join(os.path.dirname(__file__), "data", "seed.sql")

def restore_seed():
    if os.path.exists(DB_PATH):
        print(f"Database already exists at {DB_PATH}. Skipping seed.")
        return

    print("Restoring database from seed...")
    try:
        with open(SEED_PATH, "r", encoding="utf-8") as f:
            sql_script = f.read()

        db = sqlite3.connect(DB_PATH)
        db.executescript(sql_script)
        db.commit()
        db.close()
        print("Database seamlessly seeded! Now processing pending mappings so agents get their RAM...")
        
        # Trigger the vector script for these initial 50
        import requests
        try:
             # Fast API runs on 8000
             requests.post("http://localhost:8000/api/library/process_pending")
             print("Pending mappings triggered in background.")
        except Exception as e:
             print("Could not trigger mapping process automatically. Make sure the backend server (uvicorn) is running.")

    except Exception as e:
        print(f"Error seeding database: {e}")

if __name__ == "__main__":
    restore_seed()
