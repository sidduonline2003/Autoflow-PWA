from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from firebase_admin import credentials, initialize_app
import firebase_admin
from dotenv import load_dotenv
import os
import logging

# Load Environment Variables FIRST
load_dotenv()

# Import your new routers AFTER loading env variables
from .routers import clients, team, events, leave, auth as auth_router

# --- Setup & Middleware ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# --- Firebase Initialization ---
@app.on_event("startup")
async def startup_event():
    try:
        cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if not cred_path: raise Exception("Credentials not set")
        cred = credentials.Certificate(cred_path)
        if not firebase_admin._apps: initialize_app(cred)
        logger.info("Firebase Admin SDK initialized.")
    except Exception as e:
        logger.error(f"Firebase Init Error: {e}")


# --- Include Routers ---
app.include_router(auth_router.router, prefix="/api", tags=["Authentication"])
app.include_router(clients.router, prefix="/api", tags=["Client Management"])
app.include_router(team.router, prefix="/api", tags=["Team Management"])
app.include_router(events.router, prefix="/api", tags=["Event Management"])
app.include_router(leave.router, prefix="/api", tags=["Leave Management"])


@app.get("/")
def read_root():
    return {"message": "Welcome to the Production Management API"}
