"""
Insights router - AI-powered business insights and trends
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
from datetime import datetime, date, timedelta
from pydantic import BaseModel

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.firebase_client import get_db, Collections
from shared.auth import get_current_user
from shared.redis_client import cache


router = APIRouter()


# ============ SCHEMAS ============

class InsightRequest(BaseModel):
    insight_type: str
    context: Optional[dict] = None


# ============ BUSINESS INSIGHTS ============

@router.get("/dashboard")
@cache(ttl=300)  # Cache for 5 minutes
async def get_dashboard_insights(
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Get AI-powered dashboard insights"""
    db = get_db()
    today = date.today()
    month_start = today.replace(day=1).isoformat()
    
    # Gather metrics
    # This month's events
    events = list(db.collection(Collections.EVENTS)
                  .where("org_code", "==", org_code)
                  .where("event_date", ">=", month_start)
                  .where("event_date", "<=", today.isoformat()).stream())
    
    # This month's revenue
    invoices = list(db.collection(Collections.INVOICES)
                    .where("org_code", "==", org_code)
                    .where("date", ">=", month_start).stream())
    revenue = sum(float(i.to_dict().get("total", 0)) for i in invoices)
    
    # Outstanding AR
    ar_docs = list(db.collection(Collections.AR)
                   .where("org_code", "==", org_code)
                   .where("status", "!=", "paid").stream())
    outstanding = sum(float(a.to_dict().get("balance", 0)) for a in ar_docs)
    
    # Upcoming events (next 7 days)
    next_week = (today + timedelta(days=7)).isoformat()
    upcoming = list(db.collection(Collections.EVENTS)
                    .where("org_code", "==", org_code)
                    .where("event_date", ">=", today.isoformat())
                    .where("event_date", "<=", next_week).stream())
    
    # Generate insights
    insights = []
    
    # Revenue insight
    if revenue > 0:
        insights.append({
            "type": "revenue",
            "icon": "💰",
            "title": "Monthly Revenue",
            "message": f"${revenue:,.0f} earned this month from {len(invoices)} invoices",
            "priority": "info"
        })
    
    # Outstanding payments
    if outstanding > 0:
        insights.append({
            "type": "ar",
            "icon": "⚠️",
            "title": "Outstanding Payments",
            "message": f"${outstanding:,.0f} in outstanding receivables need attention",
            "priority": "warning" if outstanding > 10000 else "info"
        })
    
    # Upcoming events
    if upcoming:
        insights.append({
            "type": "events",
            "icon": "📅",
            "title": "Upcoming Events",
            "message": f"{len(upcoming)} events scheduled in the next 7 days",
            "priority": "info"
        })
    
    # Team utilization
    team = list(db.collection(Collections.TEAM)
                .where("org_code", "==", org_code)
                .where("status", "==", "active").stream())
    
    if team and upcoming:
        utilization = min(100, (len(upcoming) * 3 / len(team)) * 100)  # Rough estimate
        insights.append({
            "type": "utilization",
            "icon": "👥",
            "title": "Team Capacity",
            "message": f"Estimated {utilization:.0f}% team utilization this week",
            "priority": "warning" if utilization > 90 else "info"
        })
    
    return {
        "insights": insights,
        "metrics": {
            "events_this_month": len(events),
            "revenue_this_month": revenue,
            "outstanding_ar": outstanding,
            "upcoming_events": len(upcoming),
            "team_size": len(team)
        },
        "generated_at": datetime.utcnow().isoformat()
    }


# ============ TREND ANALYSIS ============

@router.get("/trends")
async def get_business_trends(
    org_code: str,
    months: int = 6,
    current_user: dict = Depends(get_current_user)
):
    """Get business trends over time"""
    db = get_db()
    today = date.today()
    
    monthly_data = []
    
    for i in range(months - 1, -1, -1):
        # Calculate month boundaries
        month_date = today.replace(day=1) - timedelta(days=i * 30)
        month_start = month_date.replace(day=1).isoformat()
        
        if month_date.month == 12:
            next_month = month_date.replace(year=month_date.year + 1, month=1, day=1)
        else:
            next_month = month_date.replace(month=month_date.month + 1, day=1)
        month_end = (next_month - timedelta(days=1)).isoformat()
        
        # Get events for month
        events = list(db.collection(Collections.EVENTS)
                      .where("org_code", "==", org_code)
                      .where("event_date", ">=", month_start)
                      .where("event_date", "<=", month_end).stream())
        
        # Get revenue for month
        invoices = list(db.collection(Collections.INVOICES)
                        .where("org_code", "==", org_code)
                        .where("date", ">=", month_start)
                        .where("date", "<=", month_end).stream())
        revenue = sum(float(i.to_dict().get("total", 0)) for i in invoices)
        
        # Get clients acquired
        clients = list(db.collection(Collections.CLIENTS)
                       .where("org_code", "==", org_code)
                       .where("created_at", ">=", month_start)
                       .where("created_at", "<=", month_end).stream())
        
        monthly_data.append({
            "month": month_date.strftime("%Y-%m"),
            "month_name": month_date.strftime("%B %Y"),
            "events": len(events),
            "revenue": revenue,
            "new_clients": len(clients),
            "invoices": len(invoices)
        })
    
    # Calculate trends
    if len(monthly_data) >= 2:
        revenue_change = ((monthly_data[-1]["revenue"] - monthly_data[-2]["revenue"]) 
                         / monthly_data[-2]["revenue"] * 100) if monthly_data[-2]["revenue"] > 0 else 0
        events_change = ((monthly_data[-1]["events"] - monthly_data[-2]["events"]) 
                        / monthly_data[-2]["events"] * 100) if monthly_data[-2]["events"] > 0 else 0
    else:
        revenue_change = 0
        events_change = 0
    
    return {
        "period_months": months,
        "monthly_data": monthly_data,
        "trends": {
            "revenue_change_percent": revenue_change,
            "events_change_percent": events_change,
            "total_revenue": sum(m["revenue"] for m in monthly_data),
            "total_events": sum(m["events"] for m in monthly_data),
            "avg_monthly_revenue": sum(m["revenue"] for m in monthly_data) / months if months > 0 else 0
        }
    }


# ============ PREDICTIVE INSIGHTS ============

@router.post("/predict")
async def get_predictions(
    org_code: str,
    prediction_type: str = "revenue",  # revenue, events, cash_flow
    current_user: dict = Depends(get_current_user)
):
    """AI-powered predictions based on historical data"""
    db = get_db()
    
    # Get historical data (6 months)
    today = date.today()
    six_months_ago = (today - timedelta(days=180)).isoformat()
    
    # Historical revenue
    invoices = list(db.collection(Collections.INVOICES)
                    .where("org_code", "==", org_code)
                    .where("date", ">=", six_months_ago).stream())
    
    monthly_revenue = {}
    for inv in invoices:
        data = inv.to_dict()
        month = data.get("date", "")[:7]
        monthly_revenue[month] = monthly_revenue.get(month, 0) + float(data.get("total", 0))
    
    # Historical events
    events = list(db.collection(Collections.EVENTS)
                  .where("org_code", "==", org_code)
                  .where("event_date", ">=", six_months_ago).stream())
    
    monthly_events = {}
    for evt in events:
        data = evt.to_dict()
        month = data.get("event_date", "")[:7]
        monthly_events[month] = monthly_events.get(month, 0) + 1
    
    # Use Gemini for predictions
    try:
        from gemini_client import get_gemini_client
        client = get_gemini_client()
        
        revenue_data = "\n".join([f"- {k}: ${v:,.0f}" for k, v in sorted(monthly_revenue.items())])
        events_data = "\n".join([f"- {k}: {v} events" for k, v in sorted(monthly_events.items())])
        
        prompt = f"""Based on this historical data, predict next month's {prediction_type}:

Monthly Revenue (last 6 months):
{revenue_data}

Monthly Events (last 6 months):
{events_data}

Provide:
1. Predicted value for next month
2. Confidence level (high/medium/low)
3. Key factors affecting prediction
4. Recommended actions

Format as JSON with keys: prediction, confidence, factors, recommendations"""

        result = await client.generate_text(
            prompt=prompt,
            task_type="financial_analysis",
            temperature=0.3
        )
        
        import json
        try:
            prediction = json.loads(result["text"].strip().replace("```json", "").replace("```", ""))
        except:
            prediction = {"raw_prediction": result["text"]}
        
    except Exception as e:
        prediction = {"error": str(e)}
    
    return {
        "prediction_type": prediction_type,
        "historical_data": {
            "monthly_revenue": monthly_revenue,
            "monthly_events": monthly_events
        },
        "ai_prediction": prediction,
        "generated_at": datetime.utcnow().isoformat()
    }


# ============ ANOMALY DETECTION ============

@router.get("/anomalies")
async def detect_anomalies(
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Detect unusual patterns or anomalies in business data"""
    db = get_db()
    today = date.today()
    
    anomalies = []
    
    # Check for unusually large invoices
    recent_invoices = list(db.collection(Collections.INVOICES)
                           .where("org_code", "==", org_code)
                           .order_by("total", direction="DESCENDING")
                           .limit(100).stream())
    
    if recent_invoices:
        amounts = [float(i.to_dict().get("total", 0)) for i in recent_invoices]
        avg_amount = sum(amounts) / len(amounts)
        
        for inv in recent_invoices[:10]:
            data = inv.to_dict()
            if float(data.get("total", 0)) > avg_amount * 3:
                anomalies.append({
                    "type": "large_invoice",
                    "severity": "info",
                    "message": f"Invoice {inv.id} is unusually large (${data.get('total', 0):,.0f} vs avg ${avg_amount:,.0f})",
                    "entity_id": inv.id
                })
    
    # Check for overdue payments
    overdue = list(db.collection(Collections.AR)
                   .where("org_code", "==", org_code)
                   .where("status", "!=", "paid")
                   .where("due_date", "<", today.isoformat()).stream())
    
    for ar in overdue:
        data = ar.to_dict()
        days_overdue = (today - date.fromisoformat(data.get("due_date", today.isoformat()))).days
        if days_overdue > 30:
            anomalies.append({
                "type": "severely_overdue",
                "severity": "warning",
                "message": f"Payment of ${data.get('balance', 0):,.0f} is {days_overdue} days overdue",
                "entity_id": ar.id
            })
    
    # Check for equipment issues
    equipment_issues = list(db.collection(Collections.EQUIPMENT)
                           .where("org_code", "==", org_code)
                           .where("status", "==", "maintenance").stream())
    
    if len(equipment_issues) > 3:
        anomalies.append({
            "type": "equipment_issues",
            "severity": "warning",
            "message": f"{len(equipment_issues)} equipment items are currently in maintenance",
            "count": len(equipment_issues)
        })
    
    # Check for unassigned events
    tomorrow = (today + timedelta(days=1)).isoformat()
    next_week = (today + timedelta(days=7)).isoformat()
    
    upcoming_events = list(db.collection(Collections.EVENTS)
                           .where("org_code", "==", org_code)
                           .where("event_date", ">=", tomorrow)
                           .where("event_date", "<=", next_week).stream())
    
    for event in upcoming_events:
        data = event.to_dict()
        assignments = list(db.collection(Collections.EVENT_ASSIGNMENTS)
                          .where("event_id", "==", event.id).limit(1).stream())
        if not assignments:
            anomalies.append({
                "type": "unassigned_event",
                "severity": "critical",
                "message": f"Event '{data.get('name', event.id)}' on {data.get('event_date')} has no team assignments",
                "entity_id": event.id
            })
    
    return {
        "anomalies_found": len(anomalies),
        "anomalies": anomalies,
        "checked_at": datetime.utcnow().isoformat()
    }


# ============ RECOMMENDATIONS ============

@router.get("/recommendations")
async def get_recommendations(
    org_code: str,
    category: Optional[str] = None,  # pricing, scheduling, inventory, team
    current_user: dict = Depends(get_current_user)
):
    """Get AI-powered business recommendations"""
    db = get_db()
    
    recommendations = []
    
    # Get context data
    events = list(db.collection(Collections.EVENTS)
                  .where("org_code", "==", org_code).limit(100).stream())
    
    clients = list(db.collection(Collections.CLIENTS)
                   .where("org_code", "==", org_code).stream())
    
    invoices = list(db.collection(Collections.INVOICES)
                    .where("org_code", "==", org_code).limit(100).stream())
    
    if not category or category == "pricing":
        # Pricing recommendations
        if invoices:
            amounts = [float(i.to_dict().get("total", 0)) for i in invoices]
            avg_invoice = sum(amounts) / len(amounts)
            
            recommendations.append({
                "category": "pricing",
                "title": "Average Invoice Analysis",
                "insight": f"Your average invoice is ${avg_invoice:,.0f}",
                "recommendation": "Consider tiered pricing or package deals for clients with below-average spend",
                "impact": "medium"
            })
    
    if not category or category == "scheduling":
        # Scheduling recommendations
        # Check for seasonal patterns
        event_months = {}
        for evt in events:
            data = evt.to_dict()
            month = data.get("event_date", "")[:7]
            if month:
                event_months[month] = event_months.get(month, 0) + 1
        
        if event_months:
            busy_months = sorted(event_months.items(), key=lambda x: x[1], reverse=True)[:3]
            recommendations.append({
                "category": "scheduling",
                "title": "Peak Season Preparation",
                "insight": f"Your busiest months are: {', '.join([m[0] for m in busy_months])}",
                "recommendation": "Plan equipment maintenance and hire additional staff before peak seasons",
                "impact": "high"
            })
    
    if not category or category == "inventory":
        # Equipment recommendations
        equipment = list(db.collection(Collections.EQUIPMENT)
                        .where("org_code", "==", org_code).stream())
        
        checkouts = list(db.collection(Collections.EQUIPMENT_CHECKOUTS)
                        .where("org_code", "==", org_code).stream())
        
        if equipment and checkouts:
            utilization = len(checkouts) / len(equipment) if equipment else 0
            
            recommendations.append({
                "category": "inventory",
                "title": "Equipment Utilization",
                "insight": f"Equipment utilization rate: {utilization*100:.0f}%",
                "recommendation": "High utilization suggests need for more equipment; Low utilization suggests consolidation",
                "impact": "medium"
            })
    
    return {
        "recommendations": recommendations,
        "generated_at": datetime.utcnow().isoformat()
    }
