"""
PostProd Microservice
Handles post-production workflows, assignments, reviews, and deliverables
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
    postprod,
    availability,
    assignments,
    reviews,
    deliverables,
    milestones,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup"""
    initialize_firebase()
    print("PostProd Service started")
    yield
    print("PostProd Service shutting down")


app = FastAPI(
    title="AutoStudioFlow - PostProd Service",
    description="Post-production workflow management",
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
app.include_router(postprod.router, prefix="/api/postprod", tags=["PostProd"])
app.include_router(availability.router, prefix="/api/postprod/availability", tags=["Availability"])
app.include_router(assignments.router, prefix="/api/postprod/assignments", tags=["Assignments"])
app.include_router(reviews.router, prefix="/api/postprod/reviews", tags=["Reviews"])
app.include_router(deliverables.router, prefix="/api/postprod/deliverables", tags=["Deliverables"])
app.include_router(milestones.router, prefix="/api/postprod/milestones", tags=["Milestones"])


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "postprod"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8003))
    uvicorn.run(app, host="0.0.0.0", port=port)
