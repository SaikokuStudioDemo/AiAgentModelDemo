import requests

try:
    # First get all agents
    res = requests.get('http://localhost:8000/api/agents')
    for agent in res.json():
        for source in agent['ram_sources']:
             if source['status'] == 'Updating...':
                  # Tell backend to mark it Synced
                  requests.put(f"http://localhost:8000/api/agents/{agent['id']}/ram", json={"url": source['url'], "status": "Synced", "title": source['title']})
    print("UI statuses manually patched to Synced.")
except Exception as e:
    print("Could not patch:", e)
