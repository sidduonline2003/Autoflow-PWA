"""
Core Service - Authentication, Team, Clients, Events
Handles core business logic and user management
"""

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import routers
from routers import auth, team, clients, events, messages, attendance, leave, contracts, intake

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown events"""
    # Startup
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from shared.firebase_client import init_firebase
    
    try:
        init_firebase()
        logger.info("Core Service started - Firebase initialized")
    except Exception as e:
        logger.error(f"Core Service startup error: {e}")
    
    yield
    
    # Shutdown
    logger.info("Core Service shutting down")


app = FastAPI(
    title="AutoStudioFlow Core Service",
    description="Authentication, Team, Clients, and Events management",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Disable trailing slash redirect
app.router.redirect_slashes = False

# Include routers
app.include_router(auth.router, prefix="/api", tags=["Authentication"])
app.include_router(team.router, prefix="/api", tags=["Team Management"])
app.include_router(clients.router, prefix="/api", tags=["Client Management"])
app.include_router(events.router, prefix="/api", tags=["Event Management"])
app.include_router(messages.router, prefix="/api", tags=["Messages"])
app.include_router(attendance.router, prefix="/api", tags=["Attendance"])
app.include_router(leave.router, prefix="/api", tags=["Leave Management"])
app.include_router(contracts.router, prefix="/api", tags=["Contracts"])
app.include_router(intake.router, prefix="/api", tags=["Data Intake"])


@app.get("/", response_class=HTMLResponse)
async def root():
    return "<h1>AutoStudioFlow Core Service</h1><p>Visit <a href='/docs'>/docs</a> for API documentation.</p>"


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "core", "version": "2.0.0"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
