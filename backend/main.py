from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
from dotenv import load_dotenv

load_dotenv()
if "GOOGLE_API_KEY" not in os.environ and os.getenv("GOOGLE_API_KEY"):
    os.environ["GOOGLE_API_KEY"] = os.getenv("GOOGLE_API_KEY")

from contextlib import asynccontextmanager
from apscheduler.schedulers.background import BackgroundScheduler
from app.sync_manager import set_scheduler

from app.api import router as api_router
from app.library import router as library_router
from app.library import process_pending_mappings
from app.sync_tasks import start_sync_background
import asyncio as _asyncio
from app.database import engine, Base
import app.models_db

# Create DB tables
Base.metadata.create_all(bind=engine)

def scheduled_job():
    print("Running scheduled daily e-Gov sync...")
    start_sync_background("incremental")
    print("Processing pending auto-mappings...")
    process_pending_mappings()


def scheduled_nta_sync():
    print("Running scheduled weekly NTA Tax Answer sync...")
    from app.nta_scraper import run_scrape
    _asyncio.run(run_scrape())


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = BackgroundScheduler()
    # e-Gov sync: every day at 2:00 AM
    scheduler.add_job(scheduled_job, 'cron', hour=2, minute=0, id='egov_daily')
    # NTA Tax Answer sync: every Monday at 2:00 AM
    scheduler.add_job(scheduled_nta_sync, 'cron', day_of_week='mon', hour=2, minute=0, id='nta_weekly')
    scheduler.start()
    set_scheduler(scheduler)
    print("APScheduler started: e-Gov sync @ 2:00 AM daily, NTA sync @ Monday 2:00 AM.")
    
    # Load mapped RAM sources into mock AgentsDB from SQLite
    from app.services import AgentService
    AgentService.load_mappings_from_db()
    
    yield
    scheduler.shutdown()

app = FastAPI(title="SAIKOKU STUDIO API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")
app.include_router(library_router, prefix="/api/library")

# Mount static directory for widget serving
# Create directory if it doesn't exist to prevent startup errors
os.makedirs("static", exist_ok=True)
app.mount("/widget", StaticFiles(directory="static"), name="widget")

@app.get("/")
def read_root():
    return {"message": "Welcome to SAIKOKU STUDIO API"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
