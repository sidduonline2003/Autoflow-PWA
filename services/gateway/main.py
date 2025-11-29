"""
API Gateway Service - Main entry point for AutoStudioFlow
Routes requests to appropriate microservices
"""

import os
import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse

# Import shared modules
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.firebase_client import init_firebase
from shared.auth import get_current_user, oauth2_scheme

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Service URLs - configured via environment variables for flexibility
SERVICE_URLS = {
    "core": os.getenv("CORE_SERVICE_URL", "http://localhost:8001"),
    "equipment": os.getenv("EQUIPMENT_SERVICE_URL", "http://localhost:8002"),
    "postprod": os.getenv("POSTPROD_SERVICE_URL", "http://localhost:8003"),
    "financial": os.getenv("FINANCIAL_SERVICE_URL", "http://localhost:8004"),
    "ai": os.getenv("AI_SERVICE_URL", "http://localhost:8005"),
}

# Route prefixes to services - ORDER MATTERS (more specific first)
ROUTE_MAPPING = {
    # Equipment service routes
    "/api/equipment": "equipment",
    "/api/storage-media": "equipment",
    "/api/data-submissions": "equipment",  # Storage data submissions
    
    # Post-production service routes (before /api/events)
    "/api/postprod": "postprod",
    "/api/availability": "postprod",
    "/api/deliverables": "postprod",
    "/api/reviews": "postprod",
    "/api/milestones": "postprod",
    "/api/sequences": "postprod",
    
    # Financial service routes
    "/api/financial-hub": "financial",
    "/api/financial": "financial",
    "/api/invoices": "financial",
    "/api/ar": "financial",
    "/api/ap": "financial",
    "/api/budgets": "financial",
    "/api/salaries": "financial",
    "/api/receipts": "financial",
    "/api/period-close": "financial",
    "/api/adjustments": "financial",
    "/api/approvals": "financial",
    
    # AI service routes
    "/api/ai": "ai",
    "/api/ocr": "ai",
    "/api/verify": "ai",
    "/api/analysis": "ai",
    
    # Core service routes (these are last as they are more generic)
    "/api/auth": "core",
    "/api/team": "core",
    "/api/clients": "core",
    "/api/client": "core",  # Client dashboard endpoints
    "/api/events": "core",  # Base events - but postprod routes handled specially
    "/api/messages": "core",
    "/api/attendance": "core",
    "/api/leave": "core",
    "/api/leave-requests": "core",
    "/api/contracts": "core",
    "/api/intake": "core",
}

# Special path patterns that override the prefix-based routing
# These use regex-like patterns for more specific matching
SPECIAL_ROUTES = [
    # Event postprod routes go to postprod service
    (r"/api/events/[^/]+/postprod", "postprod"),
    (r"/api/events/[^/]+/post-production", "postprod"),
    (r"/api/events/[^/]+/trigger-post-production", "postprod"),
    (r"/api/events/[^/]+/available-team", "postprod"),
    (r"/api/events/[^/]+/assign-editors", "postprod"),
    (r"/api/events/[^/]+/available-editors", "postprod"),
    (r"/api/events/[^/]+/suggest-editors", "postprod"),
    # Budget event routes go to financial
    (r"/api/budgets/events", "financial"),
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown events"""
    # Startup
    try:
        init_firebase()
        logger.info("Gateway started - Firebase initialized")
        logger.info(f"Service URLs: {SERVICE_URLS}")
    except Exception as e:
        logger.error(f"Gateway startup error: {e}")
    
    yield
    
    # Shutdown
    logger.info("Gateway shutting down")


app = FastAPI(
    title="AutoStudioFlow API Gateway",
    description="Main entry point for AutoStudioFlow microservices",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Disable trailing slash redirect
app.router.redirect_slashes = False


import re


def get_service_for_path(path: str) -> str:
    """Determine which service should handle a request based on path"""
    # First check special routes (regex patterns)
    for pattern, service in SPECIAL_ROUTES:
        if re.match(pattern, path):
            return service
    
    # Then check prefix-based routing
    for prefix, service in ROUTE_MAPPING.items():
        if path.startswith(prefix):
            return service
    return None


async def proxy_request(request: Request, service: str, path: str):
    """Proxy request to the appropriate microservice"""
    service_url = SERVICE_URLS.get(service)
    if not service_url:
        raise HTTPException(status_code=503, detail=f"Service {service} not configured")
    
    target_url = f"{service_url}{path}"
    
    # Get request body
    body = await request.body()
    
    # Forward headers (except host)
    headers = dict(request.headers)
    headers.pop("host", None)
    
    # Add query params
    if request.query_params:
        target_url += f"?{request.query_params}"
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.request(
                method=request.method,
                url=target_url,
                headers=headers,
                content=body,
            )
            
            return JSONResponse(
                content=response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text,
                status_code=response.status_code,
                headers=dict(response.headers),
            )
        except httpx.ConnectError:
            logger.error(f"Cannot connect to service {service} at {service_url}")
            raise HTTPException(status_code=503, detail=f"Service {service} unavailable")
        except Exception as e:
            logger.error(f"Proxy error: {e}")
            raise HTTPException(status_code=500, detail=str(e))


@app.get("/", response_class=HTMLResponse)
async def root():
    """Root endpoint - API documentation link"""
    return """
    <html>
        <head>
            <title>AutoStudioFlow API Gateway</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
                h1 { color: #2196F3; }
                a { color: #0078D7; text-decoration: none; }
                a:hover { text-decoration: underline; }
                .services { margin-top: 20px; }
                .service { background: #f5f5f5; padding: 10px; margin: 5px 0; border-radius: 5px; }
            </style>
        </head>
        <body>
            <h1>🚀 AutoStudioFlow API Gateway</h1>
            <p>Microservices Architecture v2.0</p>
            <p>Visit <a href="/docs">/docs</a> for interactive API documentation.</p>
            
            <div class="services">
                <h3>Available Services:</h3>
                <div class="service">🏠 <strong>Core</strong> - Auth, Team, Clients, Events</div>
                <div class="service">📷 <strong>Equipment</strong> - Inventory, Checkouts, QR codes</div>
                <div class="service">🎬 <strong>PostProd</strong> - Workflow, Editing, Reviews</div>
                <div class="service">💰 <strong>Financial</strong> - Invoices, Payments, AR/AP</div>
                <div class="service">🤖 <strong>AI</strong> - OCR, Analysis, Verification</div>
            </div>
        </body>
    </html>
    """


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "gateway",
        "version": "2.0.0",
    }


@app.get("/health/services")
async def check_services():
    """Check health of all backend services"""
    results = {}
    
    async with httpx.AsyncClient(timeout=5.0) as client:
        for service, url in SERVICE_URLS.items():
            try:
                response = await client.get(f"{url}/health")
                results[service] = {
                    "status": "healthy" if response.status_code == 200 else "unhealthy",
                    "url": url,
                }
            except Exception as e:
                results[service] = {
                    "status": "unavailable",
                    "url": url,
                    "error": str(e),
                }
    
    return {"services": results}


# Catch-all route for API requests
@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy_api(request: Request, path: str):
    """Proxy all /api/* requests to appropriate microservices"""
    full_path = f"/api/{path}"
    service = get_service_for_path(full_path)
    
    if not service:
        raise HTTPException(status_code=404, detail=f"No service found for path: {full_path}")
    
    logger.debug(f"Routing {request.method} {full_path} -> {service}")
    return await proxy_request(request, service, full_path)


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
