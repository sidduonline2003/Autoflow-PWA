from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from firebase_admin import credentials, initialize_app
import firebase_admin
from dotenv import load_dotenv
import os
import logging
from fastapi import FastAPI
from fastapi.routing import APIRoute

# Load Environment Variables FIRST
load_dotenv()

# Import your new routers AFTER loading env variables
from .routers import clients, team, events, leave, auth as auth_router, invoices, messages, deliverables, equipment, contracts, budgets, milestones, approvals, client_dashboard, attendance, salaries, financial_client_revenue, financial_hub, ar, ap, period_close, adjustments, sequences, receipts

# --- Setup & Middleware ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.router.redirect_slashes = False  # Disable redirecting slashes

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
# FIXED: Use single /api prefix for routers that already have their own prefix
# This prevents double-prefix bugs like /api/events/events/...

# Routers WITH internal prefix - just use /api
app.include_router(auth_router.router, prefix="/api", tags=["Authentication"])
app.include_router(clients.router, prefix="/api", tags=["Client Management"])
app.include_router(team.router, prefix="/api", tags=["Team Management"])
app.include_router(events.router, prefix="/api", tags=["Event Management"])
app.include_router(leave.router, prefix="/api", tags=["Leave Management"])
app.include_router(invoices.router, prefix="/api", tags=["Invoice Management"])
app.include_router(messages.router, prefix="/api", tags=["Message Management"])
app.include_router(deliverables.router, prefix="/api", tags=["Deliverable Management"])
app.include_router(equipment.router, prefix="/api", tags=["Equipment Management"])
app.include_router(contracts.router, prefix="/api", tags=["Contract Management"])
app.include_router(budgets.router, prefix="/api", tags=["Budget Management"])
app.include_router(milestones.router, prefix="/api", tags=["Milestone Management"])
app.include_router(approvals.router, prefix="/api", tags=["Approval Management"])
app.include_router(attendance.router, prefix="/api", tags=["Attendance Management"])
app.include_router(salaries.router, prefix="/api", tags=["Salary Management"])
app.include_router(receipts.router, prefix="/api", tags=["Receipt Management"])

# Routers WITHOUT internal prefix - keep explicit mount paths
app.include_router(client_dashboard.router, prefix="/api/client-dashboard", tags=["Client Dashboard"])
app.include_router(financial_client_revenue.router, prefix="/api", tags=["Financial Hub - Client Revenue"])
app.include_router(financial_hub.router, prefix="/api", tags=["Financial Hub"])
app.include_router(ar.router, prefix="/api", tags=["Client AR Portal"])
app.include_router(ap.router, prefix="/api", tags=["Accounts Payable"])

# Period Close & Controls System (Sprint 6)
app.include_router(period_close.router, prefix="/api", tags=["Period Close & Controls"])
app.include_router(adjustments.router, prefix="/api", tags=["Journal Adjustments"])
app.include_router(sequences.router, prefix="/api", tags=["Number Sequences"])

@app.get("/", response_class=HTMLResponse)
def read_root():
    return """
    <html>
        <head>
            <title>AutoStudioFlow API</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
                h1 { color: #333; }
                a { color: #0078D7; text-decoration: none; }
                a:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <h1>Welcome to the AutoStudioFlow API</h1>
            <p>This is the backend API for the AutoStudioFlow application.</p>
            <p>Visit <a href="/docs">/docs</a> for the interactive API documentation.</p>
        </body>
    </html>
    """
