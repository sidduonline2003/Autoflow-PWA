# 🔄 Migration Guide: Monolith to Microservices

## Overview

This guide helps you migrate from the old monolithic `backend/` to the new microservices architecture in `services/`.

---

## 📊 Architecture Comparison

```
OLD (Monolith)                         NEW (Microservices)
─────────────────                      ──────────────────────

backend/                               services/
├── main.py (single app)               ├── gateway/     → Port 8000
├── routers/                           ├── core/        → Port 8001
│   ├── auth.py                        ├── equipment/   → Port 8002
│   ├── team.py                        ├── postprod/    → Port 8003
│   ├── clients.py                     ├── financial/   → Port 8004
│   ├── events.py                      ├── ai/          → Port 8005
│   ├── equipment.py                   └── shared/      → Common code
│   ├── financial.py
│   └── ... (40+ routers)
├── services/
├── schemas/
└── utils/

Single Deployment                      6 Independent Deployments
Scales as One Unit                     Each Service Scales Independently
Single Point of Failure                Fault Isolation
```

---

## 🗺️ Router Migration Map

### Core Service (Port 8001)
| Old Location | New Location |
|--------------|--------------|
| `backend/routers/auth.py` | `services/core/routers/auth.py` |
| `backend/routers/team.py` | `services/core/routers/team.py` |
| `backend/routers/clients.py` | `services/core/routers/clients.py` |
| `backend/routers/events.py` | `services/core/routers/events.py` |
| `backend/routers/messages.py` | `services/core/routers/messages.py` |
| `backend/routers/attendance.py` | `services/core/routers/attendance.py` |
| `backend/routers/leave.py` | `services/core/routers/leave.py` |
| `backend/routers/contracts.py` | `services/core/routers/contracts.py` |
| `backend/routers/intake.py` | `services/core/routers/intake.py` |

### Equipment Service (Port 8002)
| Old Location | New Location |
|--------------|--------------|
| `backend/routers/equipment.py` | `services/equipment/routers/inventory.py` |
| `backend/routers/equipment_checkouts.py` | `services/equipment/routers/checkouts.py` |
| `backend/routers/maintenance.py` | `services/equipment/routers/maintenance.py` |
| `backend/routers/storage_media.py` | `services/equipment/routers/storage_media.py` |
| `backend/routers/equipment_analytics.py` | `services/equipment/routers/analytics.py` |

### PostProd Service (Port 8003)
| Old Location | New Location |
|--------------|--------------|
| `backend/routers/postprod.py` | `services/postprod/routers/postprod.py` |
| `backend/routers/availability.py` | `services/postprod/routers/availability.py` |
| `backend/routers/assignments.py` | `services/postprod/routers/assignments.py` |
| `backend/routers/reviews.py` | `services/postprod/routers/reviews.py` |
| `backend/routers/deliverables.py` | `services/postprod/routers/deliverables.py` |
| `backend/routers/milestones.py` | `services/postprod/routers/milestones.py` |

### Financial Service (Port 8004)
| Old Location | New Location |
|--------------|--------------|
| `backend/routers/financial.py` | `services/financial/routers/financial_hub.py` |
| `backend/routers/ar.py` | `services/financial/routers/ar.py` |
| `backend/routers/ap.py` | `services/financial/routers/ap.py` |
| `backend/routers/invoices.py` | `services/financial/routers/invoices.py` |
| `backend/routers/receipts.py` | `services/financial/routers/receipts.py` |
| `backend/routers/budgets.py` | `services/financial/routers/budgets.py` |
| `backend/routers/salaries.py` | `services/financial/routers/salaries.py` |
| `backend/routers/period_close.py` | `services/financial/routers/period_close.py` |
| `backend/routers/adjustments.py` | `services/financial/routers/adjustments.py` |

### AI Service (Port 8005)
| Old Location | New Location |
|--------------|--------------|
| `backend/routers/ai_*.py` | `services/ai/routers/ocr.py` |
| `backend/services/gemini_service.py` | `services/ai/gemini_client.py` |
| (new) | `services/ai/routers/analysis.py` |
| (new) | `services/ai/routers/insights.py` |
| (new) | `services/ai/routers/suggestions.py` |

---

## 🔧 Step-by-Step Migration

### Phase 1: Setup (Day 1)

#### 1.1 Create Environment Files
```bash
cd services

# Copy environment template
cp .env.example .env

# Edit with your values
nano .env
```

#### 1.2 Copy Firebase Credentials
```bash
# Create credentials directory
mkdir -p services/credentials

# Copy your Firebase key
cp backend/app1bysiddu-95459-firebase-adminsdk-fbsvc-efb2c7c181.json \
   services/credentials/firebase-key.json
```

#### 1.3 Update .env File
```bash
# services/.env
GOOGLE_APPLICATION_CREDENTIALS=./credentials/firebase-key.json
REDIS_URL=redis://localhost:6379
GEMINI_API_KEY=your-key-here

# Service URLs (local)
CORE_SERVICE_URL=http://localhost:8001
EQUIPMENT_SERVICE_URL=http://localhost:8002
POSTPROD_SERVICE_URL=http://localhost:8003
FINANCIAL_SERVICE_URL=http://localhost:8004
AI_SERVICE_URL=http://localhost:8005
```

### Phase 2: Test Microservices Locally (Day 1-2)

#### 2.1 Start with Docker Compose
```bash
cd services
docker-compose up --build
```

#### 2.2 Test Health Endpoints
```bash
# Gateway health
curl http://localhost:8000/health

# All services status
curl http://localhost:8000/services

# Individual services
curl http://localhost:8001/health  # Core
curl http://localhost:8002/health  # Equipment
curl http://localhost:8003/health  # PostProd
curl http://localhost:8004/health  # Financial
curl http://localhost:8005/health  # AI
```

#### 2.3 Test Critical Endpoints
```bash
# Test auth (Core service)
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "test123"}'

# Test equipment list
curl http://localhost:8000/api/equipment?org_code=TEST

# Test events
curl http://localhost:8000/api/events?org_code=TEST
```

### Phase 3: Frontend Updates (Day 2-3)

#### 3.1 Update API Base URL
The gateway handles routing, so frontend only needs ONE base URL:

```typescript
// frontend/src/config/api.ts

// OLD
const API_BASE = 'http://localhost:8000';  // Monolith

// NEW (same URL, gateway routes internally)
const API_BASE = 'http://localhost:8000';  // Gateway
```

**No frontend changes needed!** The gateway proxies all requests to the correct service.

#### 3.2 Verify All API Paths Work
All existing API paths remain the same:
- `/api/auth/*` → Core service
- `/api/team/*` → Core service
- `/api/equipment/*` → Equipment service
- `/api/postprod/*` → PostProd service
- `/api/financial/*` → Financial service
- `/api/ai/*` → AI service

### Phase 4: Parallel Running (Day 3-5)

Run both systems simultaneously to compare:

```bash
# Terminal 1: Old backend (port 8000)
cd backend
source venv/bin/activate
uvicorn main:app --port 8080  # Use different port

# Terminal 2: New microservices (port 8000)
cd services
docker-compose up
```

#### Compare Responses
```bash
# Old
curl http://localhost:8080/api/team?org_code=TEST > old_response.json

# New
curl http://localhost:8000/api/team?org_code=TEST > new_response.json

# Compare
diff old_response.json new_response.json
```

### Phase 5: Production Deployment (Day 5-7)

#### 5.1 Deploy to GCP Cloud Run

```bash
# Set project
gcloud config set project YOUR_PROJECT_ID

# Deploy using Cloud Build
cd services
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_REGION=us-central1,_REDIS_URL=your-redis-url,_GEMINI_API_KEY=your-key
```

#### 5.2 Get Service URLs
```bash
# After deployment, get URLs
gcloud run services list --platform managed
```

Update Gateway environment with Cloud Run URLs:
```
CORE_SERVICE_URL=https://autostudioflow-core-xxxxx-uc.a.run.app
EQUIPMENT_SERVICE_URL=https://autostudioflow-equipment-xxxxx-uc.a.run.app
...
```

#### 5.3 Update Frontend Production URL
```typescript
// frontend/src/config/api.ts
const API_BASE = process.env.NODE_ENV === 'production'
  ? 'https://autostudioflow-gateway-xxxxx-uc.a.run.app'
  : 'http://localhost:8000';
```

### Phase 6: Cleanup (Day 7+)

#### 6.1 Backup Old Backend
```bash
# Create backup
tar -czvf backend_backup_$(date +%Y%m%d).tar.gz backend/

# Move to archive
mv backend_backup_*.tar.gz ~/backups/
```

#### 6.2 Remove Old Backend
```bash
# Only after confirming microservices work!
rm -rf backend/
```

#### 6.3 Update .gitignore
```bash
# Add to .gitignore
echo "backend_old_backup/" >> .gitignore
```

---

## 🔍 Troubleshooting

### Common Issues

#### 1. Service Not Responding
```bash
# Check if service is running
docker-compose ps

# Check logs
docker-compose logs core
docker-compose logs equipment
```

#### 2. Firebase Connection Issues
```bash
# Verify credentials path
ls -la services/credentials/

# Check environment variable
echo $GOOGLE_APPLICATION_CREDENTIALS
```

#### 3. Redis Connection Failed
```bash
# Check if Redis is running
docker-compose ps redis

# Test Redis connection
docker exec -it services_redis_1 redis-cli ping
```

#### 4. CORS Errors in Frontend
Check gateway CORS configuration in `services/gateway/main.py`:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "https://yourdomain.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

#### 5. 404 on API Routes
Verify the route prefix in the service's `main.py`:
```python
# Example: services/core/main.py
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
```

---

## ✅ Migration Checklist

### Pre-Migration
- [ ] Backup current backend
- [ ] Document all custom modifications
- [ ] List all environment variables used
- [ ] Note any cron jobs or background tasks

### During Migration
- [ ] Set up services/.env
- [ ] Copy Firebase credentials
- [ ] Test each service individually
- [ ] Test all critical API endpoints
- [ ] Run parallel comparison tests
- [ ] Update frontend configuration (if needed)

### Post-Migration
- [ ] Monitor error rates for 48 hours
- [ ] Check performance metrics
- [ ] Verify all features work
- [ ] Update documentation
- [ ] Remove old backend
- [ ] Update CI/CD pipelines

---

## 📞 Quick Reference

### Service Ports
| Service | Local Port | Purpose |
|---------|------------|---------|
| Gateway | 8000 | API routing |
| Core | 8001 | Auth, Team, Events |
| Equipment | 8002 | Inventory, Checkouts |
| PostProd | 8003 | Post-production |
| Financial | 8004 | Invoices, Payments |
| AI | 8005 | OCR, Analysis |
| Redis | 6379 | Caching |

### Useful Commands
```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f [service-name]

# Rebuild single service
docker-compose up -d --build core

# Check service health
curl http://localhost:8000/health
```

### Emergency Rollback
If issues occur, quickly rollback:
```bash
# Stop microservices
cd services
docker-compose down

# Start old backend
cd ../backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000
```

---

## 📈 Expected Benefits After Migration

| Metric | Before | After |
|--------|--------|-------|
| Deployment Time | 5-10 min (all) | 1-2 min (per service) |
| Scaling | Whole app | Per service |
| Fault Isolation | None | Per service |
| Cold Start | ~10s | ~3s per service |
| Memory per Instance | 1-2 GB | 256-512 MB |
| Cost (Cloud Run) | ~$150/mo | ~$100-150/mo |

---

*Migration guide created: November 29, 2025*
*Target completion: 1 week*
