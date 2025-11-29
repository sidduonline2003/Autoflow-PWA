"""
Equipment Service - Inventory, checkouts, QR codes, and analytics
Handles all equipment-related operations
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
from routers import inventory, checkouts, maintenance, storage_media, analytics

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from shared.firebase_client import init_firebase
    
    try:
        init_firebase()
        logger.info("Equipment Service started - Firebase initialized")
    except Exception as e:
        logger.error(f"Equipment Service startup error: {e}")
    
    yield
    logger.info("Equipment Service shutting down")


app = FastAPI(
    title="AutoStudioFlow Equipment Service",
    description="Equipment inventory, checkouts, and QR code management",
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

app.router.redirect_slashes = False

# Include routers
app.include_router(inventory.router, prefix="/api", tags=["Equipment Inventory"])
app.include_router(checkouts.router, prefix="/api", tags=["Checkouts"])
app.include_router(maintenance.router, prefix="/api", tags=["Maintenance"])
app.include_router(storage_media.router, prefix="/api", tags=["Storage Media"])
app.include_router(analytics.router, prefix="/api", tags=["Analytics"])


@app.get("/", response_class=HTMLResponse)
async def root():
    return "<h1>AutoStudioFlow Equipment Service</h1><p>Visit <a href='/docs'>/docs</a> for API documentation.</p>"


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "equipment", "version": "2.0.0"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8002))
    uvicorn.run(app, host="0.0.0.0", port=port)
