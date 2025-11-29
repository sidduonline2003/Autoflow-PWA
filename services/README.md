# AutoStudioFlow Microservices

## Architecture Overview

This is a microservices architecture for AutoStudioFlow, designed for Google Cloud Platform deployment.

```
                    ┌─────────────────────────────────────────┐
                    │              Load Balancer               │
                    └─────────────────┬───────────────────────┘
                                      │
                    ┌─────────────────▼───────────────────────┐
                    │           Gateway Service                │
                    │           (Port 8000)                    │
                    │    - API Routing & Proxying              │
                    │    - CORS & Auth Headers                 │
                    │    - Health Checks                       │
                    └──────┬──────┬──────┬──────┬──────┬──────┘
                           │      │      │      │      │
        ┌──────────────────┘      │      │      │      └──────────────────┐
        │                         │      │      │                         │
        ▼                         ▼      ▼      ▼                         ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│     Core      │  │   Equipment   │  │   PostProd    │  │   Financial   │  │      AI       │
│  (Port 8001)  │  │  (Port 8002)  │  │  (Port 8003)  │  │  (Port 8004)  │  │  (Port 8005)  │
│               │  │               │  │               │  │               │  │               │
│ - Auth        │  │ - Inventory   │  │ - PostProd    │  │ - Financial   │  │ - OCR         │
│ - Team        │  │ - Checkouts   │  │ - Availability│  │   Hub         │  │ - Analysis    │
│ - Clients     │  │ - Maintenance │  │ - Assignments │  │ - AR/AP       │  │ - Insights    │
│ - Events      │  │ - Storage     │  │ - Reviews     │  │ - Invoices    │  │ - Suggestions │
│ - Messages    │  │ - Analytics   │  │ - Deliverables│  │ - Budgets     │  │               │
│ - Attendance  │  │ - QR Codes    │  │ - Milestones  │  │ - Salaries    │  │   Gemini API  │
│ - Leave       │  │               │  │               │  │               │  │   Integration │
│ - Contracts   │  │               │  │               │  │               │  │               │
│ - Intake      │  │               │  │               │  │               │  │               │
└───────┬───────┘  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘
        │                  │                  │                  │                  │
        └──────────────────┴──────────────────┴──────────────────┴──────────────────┘
                                              │
                              ┌───────────────┴───────────────┐
                              │        Shared Resources        │
                              │  - Firestore (Single Database) │
                              │  - Redis Cache                 │
                              │  - Firebase Auth               │
                              └───────────────────────────────┘
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Gateway | 8000 | API routing, CORS, health checks |
| Core | 8001 | Auth, Team, Clients, Events, Messages, Attendance, Leave, Contracts, Intake |
| Equipment | 8002 | Inventory, Checkouts, Maintenance, Storage Media, Analytics |
| PostProd | 8003 | Post-production, Availability, Assignments, Reviews, Deliverables, Milestones |
| Financial | 8004 | Financial Hub, AR, AP, Invoices, Receipts, Budgets, Salaries, Period Close, Adjustments |
| AI | 8005 | OCR, Analysis, Insights, Suggestions (Gemini API) |

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Firebase project with Firestore
- Google Cloud project (for deployment)
- Gemini API key

### Local Development

1. **Copy environment file:**
```bash
cp .env.example .env
# Edit .env with your values
```

2. **Add Firebase credentials:**
```bash
mkdir -p credentials
# Copy your firebase-key.json to credentials/
```

3. **Start all services:**
```bash
docker-compose up --build
```

4. **Test the API:**
```bash
# Health check
curl http://localhost:8000/health

# Service status
curl http://localhost:8000/services
```

### Running Individual Services (Development)

```bash
# Install dependencies
cd core
pip install -r requirements.txt

# Run service
uvicorn main:app --reload --port 8001
```

## API Endpoints

### Gateway (Port 8000)
- `GET /health` - Health check
- `GET /services` - Service status
- All other routes proxy to respective services

### Core Service (Port 8001)
- `POST /api/auth/*` - Authentication
- `GET/POST /api/team/*` - Team management
- `GET/POST /api/clients/*` - Client management
- `GET/POST /api/events/*` - Event management
- `GET/POST /api/messages/*` - Messaging
- `GET/POST /api/attendance/*` - Attendance
- `GET/POST /api/leave/*` - Leave management
- `GET/POST /api/contracts/*` - Contracts
- `POST /api/intake/*` - Client intake

### Equipment Service (Port 8002)
- `GET/POST /api/equipment/*` - Equipment inventory
- `GET/POST /api/equipment-checkouts/*` - Checkouts
- `GET/POST /api/maintenance/*` - Maintenance
- `GET/POST /api/storage-media/*` - Storage devices
- `GET /api/equipment-analytics/*` - Analytics

### PostProd Service (Port 8003)
- `GET/POST /api/postprod/*` - Post-production
- `GET/POST /api/availability/*` - Availability
- `GET/POST /api/assignments/*` - Assignments
- `GET/POST /api/reviews/*` - Reviews
- `GET/POST /api/deliverables/*` - Deliverables
- `GET/POST /api/milestones/*` - Milestones

### Financial Service (Port 8004)
- `GET /api/financial/*` - Financial hub/dashboard
- `GET/POST /api/ar/*` - Accounts receivable
- `GET/POST /api/ap/*` - Accounts payable
- `GET/POST /api/invoices/*` - Invoices
- `GET/POST /api/receipts/*` - Receipts
- `GET/POST /api/budgets/*` - Budgets
- `GET/POST /api/salaries/*` - Salaries
- `POST /api/period-close/*` - Period close
- `POST /api/adjustments/*` - Adjustments

### AI Service (Port 8005)
- `POST /api/ai/ocr/*` - Document OCR
- `POST /api/ai/analysis/*` - Financial/team analysis
- `GET /api/ai/insights/*` - Business insights
- `POST /api/ai/suggestions/*` - Smart suggestions

## Deployment to GCP

### Using Cloud Build

1. **Set up Cloud Build trigger:**
```bash
gcloud builds triggers create github \
  --repo-name="autostudioflow" \
  --repo-owner="your-org" \
  --branch-pattern="^main$" \
  --build-config="services/cloudbuild.yaml" \
  --substitutions="_REGION=us-central1,_REDIS_URL=your-redis-url,_GEMINI_API_KEY=your-key"
```

2. **Deploy manually:**
```bash
gcloud builds submit --config=cloudbuild.yaml --substitutions=_REGION=us-central1
```

### Environment Variables

Set these in Cloud Run or Cloud Build:
- `GOOGLE_APPLICATION_CREDENTIALS` - Firebase service account
- `REDIS_URL` - Redis connection string
- `GEMINI_API_KEY` - Gemini API key
- `CORE_SERVICE_URL` - Core service Cloud Run URL
- `EQUIPMENT_SERVICE_URL` - Equipment service Cloud Run URL
- `POSTPROD_SERVICE_URL` - PostProd service Cloud Run URL
- `FINANCIAL_SERVICE_URL` - Financial service Cloud Run URL
- `AI_SERVICE_URL` - AI service Cloud Run URL

## Estimated Costs (GCP)

| Resource | Estimate |
|----------|----------|
| Cloud Run (6 services) | $100-150/month |
| Firestore | $80-150/month |
| Redis (Upstash) | $20-50/month |
| Gemini API | $40-150/month |
| **Total** | **$260-500/month** |

*Based on 20K DAU, 10K AI requests/day*

## Shared Module

The `shared/` directory contains common code:
- `firebase_client.py` - Firestore connection & collections
- `redis_client.py` - Redis caching decorator
- `auth.py` - Authentication utilities
- `models.py` - Shared Pydantic models
- `utils/helpers.py` - Common helper functions

## Development Tips

1. **Hot reload:** Use `--reload` flag with uvicorn
2. **Logging:** All services log to stdout
3. **Testing:** Run individual services with their own requirements
4. **Debugging:** Use `/health` endpoints for service status
