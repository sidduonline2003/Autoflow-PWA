"""
Financial Microservice
Handles AR, AP, invoices, receipts, budgets, salaries, and financial reporting
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
    financial_hub,
    ar,
    ap,
    invoices,
    receipts,
    budgets,
    salaries,
    period_close,
    adjustments,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup"""
    initialize_firebase()
    print("Financial Service started")
    yield
    print("Financial Service shutting down")


app = FastAPI(
    title="AutoStudioFlow - Financial Service",
    description="Financial management and reporting",
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
app.include_router(financial_hub.router, prefix="/api/financial", tags=["Financial Hub"])
app.include_router(ar.router, prefix="/api/ar", tags=["Accounts Receivable"])
app.include_router(ap.router, prefix="/api/ap", tags=["Accounts Payable"])
app.include_router(invoices.router, prefix="/api/invoices", tags=["Invoices"])
app.include_router(receipts.router, prefix="/api/receipts", tags=["Receipts"])
app.include_router(budgets.router, prefix="/api/budgets", tags=["Budgets"])
app.include_router(salaries.router, prefix="/api/salaries", tags=["Salaries"])
app.include_router(period_close.router, prefix="/api/period-close", tags=["Period Close"])
app.include_router(adjustments.router, prefix="/api/adjustments", tags=["Adjustments"])


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "financial"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8004))
    uvicorn.run(app, host="0.0.0.0", port=port)
