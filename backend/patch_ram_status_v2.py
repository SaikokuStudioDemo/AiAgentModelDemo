import requests

try:
    # Tell the backend to fully reload from SQLite, clearing out old garbage
    requests.post("http://localhost:8000/api/library/process_pending")
    # Actually we just restarted uvicorn, so it already loaded from DB! 
    # But wait, did we restart it after that code change? No, let's restart it now.
    print("Script created for manual use if needed.")
except Exception as e:
    print("Could not patch:", e)
