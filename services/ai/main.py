"""
AI Microservice
Handles OCR, document analysis, AI insights, and intelligent features
Uses Gemini API with smart routing (Flash for simple, Pro for complex)
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv

load_dotenv()

# Import shared modules
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.firebase_client import initialize_firebase

# Import routers
from routers import (
    ocr,
    analysis,
    insights,
    suggestions,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup"""
    initialize_firebase()
    print("AI Service started")
    yield
    print("AI Service shutting down")


app = FastAPI(
    title="AutoStudioFlow - AI Service",
    description="AI-powered features: OCR, analysis, insights",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(ocr.router, prefix="/api/ai/ocr", tags=["OCR"])
app.include_router(analysis.router, prefix="/api/ai/analysis", tags=["Analysis"])
app.include_router(insights.router, prefix="/api/ai/insights", tags=["Insights"])
app.include_router(suggestions.router, prefix="/api/ai/suggestions", tags=["Suggestions"])


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "ai"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8005))
    uvicorn.run(app, host="0.0.0.0", port=port)
