"""
Analysis router - AI-powered data analysis
"""

from fastapi import APIRouter, HTTPException, Depends, Query
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

class AnalysisRequest(BaseModel):
    analysis_type: str  # financial, team_performance, event_profitability, client_health
    date_range_start: Optional[str] = None
    date_range_end: Optional[str] = None
    filters: Optional[dict] = None


# ============ FINANCIAL ANALYSIS ============

@router.post("/financial")
async def analyze_financials(
    org_code: str,
    date_range_start: Optional[str] = None,
    date_range_end: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """AI-powered financial analysis"""
    db = get_db()
    
    # Default to last 3 months
    if not date_range_end:
        date_range_end = date.today().isoformat()
    if not date_range_start:
        date_range_start = (date.today() - timedelta(days=90)).isoformat()
    
    # Gather financial data
    # Revenue
    invoices = list(db.collection(Collections.INVOICES)
                    .where("org_code", "==", org_code)
                    .where("date", ">=", date_range_start)
                    .where("date", "<=", date_range_end).stream())
    
    total_revenue = sum(float(d.to_dict().get("total", 0)) for d in invoices)
    invoice_count = len(invoices)
    
    # Expenses
    receipts = list(db.collection(Collections.RECEIPTS)
                    .where("org_code", "==", org_code)
                    .where("date", ">=", date_range_start)
                    .where("date", "<=", date_range_end).stream())
    
    total_expenses = sum(float(d.to_dict().get("amount", 0)) for d in receipts)
    
    # Outstanding AR
    ar_docs = list(db.collection(Collections.AR)
                   .where("org_code", "==", org_code)
                   .where("status", "!=", "paid").stream())
    
    outstanding_ar = sum(float(d.to_dict().get("balance", 0)) for d in ar_docs)
    overdue_ar = sum(
        float(d.to_dict().get("balance", 0)) 
        for d in ar_docs 
        if d.to_dict().get("due_date", "") < date.today().isoformat()
    )
    
    # Outstanding AP
    ap_docs = list(db.collection(Collections.AP)
                   .where("org_code", "==", org_code)
                   .where("status", "!=", "paid").stream())
    
    outstanding_ap = sum(float(d.to_dict().get("balance", 0)) for d in ap_docs)
    
    # Calculate metrics
    profit = total_revenue - total_expenses
    profit_margin = (profit / total_revenue * 100) if total_revenue > 0 else 0
    avg_invoice = total_revenue / invoice_count if invoice_count > 0 else 0
    
    # Build analysis prompt
    try:
        from gemini_client import get_gemini_client
        client = get_gemini_client()
        
        prompt = f"""Analyze this financial data and provide insights:

Period: {date_range_start} to {date_range_end}

Key Metrics:
- Total Revenue: ${total_revenue:,.2f}
- Total Expenses: ${total_expenses:,.2f}
- Net Profit: ${profit:,.2f}
- Profit Margin: {profit_margin:.1f}%
- Average Invoice Value: ${avg_invoice:,.2f}
- Number of Invoices: {invoice_count}
- Outstanding Receivables: ${outstanding_ar:,.2f}
- Overdue Receivables: ${overdue_ar:,.2f}
- Outstanding Payables: ${outstanding_ap:,.2f}

Provide:
1. Overall financial health assessment (Good/Moderate/Needs Attention)
2. Key strengths (2-3 points)
3. Areas of concern (2-3 points)
4. Specific actionable recommendations (3-5 points)
5. Cash flow prediction for next month

Format as JSON with keys: health_score, strengths, concerns, recommendations, cash_flow_prediction"""

        result = await client.generate_text(
            prompt=prompt,
            task_type="financial_analysis",
            temperature=0.3
        )
        
        import json
        try:
            analysis = json.loads(result["text"].strip().replace("```json", "").replace("```", ""))
        except:
            analysis = {"raw_analysis": result["text"]}
        
    except Exception as e:
        analysis = {
            "health_score": "Unable to generate AI analysis",
            "error": str(e)
        }
    
    return {
        "period": {"start": date_range_start, "end": date_range_end},
        "metrics": {
            "revenue": total_revenue,
            "expenses": total_expenses,
            "profit": profit,
            "profit_margin": profit_margin,
            "avg_invoice_value": avg_invoice,
            "invoice_count": invoice_count,
            "outstanding_ar": outstanding_ar,
            "overdue_ar": overdue_ar,
            "outstanding_ap": outstanding_ap
        },
        "ai_analysis": analysis,
        "generated_at": datetime.utcnow().isoformat()
    }


# ============ TEAM PERFORMANCE ============

@router.post("/team-performance")
async def analyze_team_performance(
    org_code: str,
    date_range_start: Optional[str] = None,
    date_range_end: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """AI analysis of team performance"""
    db = get_db()
    
    # Default to last month
    if not date_range_end:
        date_range_end = date.today().isoformat()
    if not date_range_start:
        date_range_start = (date.today() - timedelta(days=30)).isoformat()
    
    # Get team members
    team_docs = list(db.collection(Collections.TEAM)
                     .where("org_code", "==", org_code)
                     .where("status", "==", "active").stream())
    
    team_data = []
    
    for doc in team_docs:
        member = doc.to_dict()
        member_id = doc.id
        
        # Get attendance
        attendance_docs = list(db.collection(Collections.ATTENDANCE)
                               .where("employee_id", "==", member_id)
                               .where("date", ">=", date_range_start)
                               .where("date", "<=", date_range_end).stream())
        
        present_days = sum(1 for a in attendance_docs if a.to_dict().get("status") == "present")
        total_days = len(attendance_docs)
        
        # Get events worked
        assignments = list(db.collection(Collections.EVENT_ASSIGNMENTS)
                           .where("employee_id", "==", member_id)
                           .where("event_date", ">=", date_range_start)
                           .where("event_date", "<=", date_range_end).stream())
        
        events_worked = len(assignments)
        
        team_data.append({
            "name": member.get("name", "Unknown"),
            "role": member.get("role", "Unknown"),
            "attendance_rate": (present_days / total_days * 100) if total_days > 0 else 0,
            "events_worked": events_worked,
            "present_days": present_days
        })
    
    # Generate AI analysis
    try:
        from gemini_client import get_gemini_client
        client = get_gemini_client()
        
        team_summary = "\n".join([
            f"- {m['name']} ({m['role']}): {m['attendance_rate']:.0f}% attendance, {m['events_worked']} events"
            for m in team_data
        ])
        
        prompt = f"""Analyze this team performance data:

Period: {date_range_start} to {date_range_end}

Team Members:
{team_summary}

Provide:
1. Overall team performance assessment
2. Top performers (and why)
3. Areas needing improvement
4. Workload distribution analysis
5. Recommendations for team optimization

Format as JSON with keys: overall_assessment, top_performers, improvement_areas, workload_analysis, recommendations"""

        result = await client.generate_text(
            prompt=prompt,
            task_type="general",
            temperature=0.4
        )
        
        import json
        try:
            analysis = json.loads(result["text"].strip().replace("```json", "").replace("```", ""))
        except:
            analysis = {"raw_analysis": result["text"]}
        
    except Exception as e:
        analysis = {"error": str(e)}
    
    return {
        "period": {"start": date_range_start, "end": date_range_end},
        "team_size": len(team_data),
        "team_metrics": team_data,
        "ai_analysis": analysis,
        "generated_at": datetime.utcnow().isoformat()
    }


# ============ EVENT PROFITABILITY ============

@router.post("/event-profitability")
async def analyze_event_profitability(
    org_code: str,
    event_id: Optional[str] = None,
    date_range_start: Optional[str] = None,
    date_range_end: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Analyze profitability of events"""
    db = get_db()
    
    if event_id:
        # Single event analysis
        event_doc = db.collection(Collections.EVENTS).document(event_id).get()
        if not event_doc.exists:
            raise HTTPException(status_code=404, detail="Event not found")
        
        events = [{"id": event_id, **event_doc.to_dict()}]
    else:
        # Multiple events
        query = db.collection(Collections.EVENTS).where("org_code", "==", org_code)
        if date_range_start:
            query = query.where("event_date", ">=", date_range_start)
        if date_range_end:
            query = query.where("event_date", "<=", date_range_end)
        
        events = [{"id": d.id, **d.to_dict()} for d in query.limit(50).stream()]
    
    event_analyses = []
    
    for event in events:
        eid = event["id"]
        
        # Get revenue
        invoices = list(db.collection(Collections.INVOICES)
                        .where("event_id", "==", eid).stream())
        revenue = sum(float(i.to_dict().get("total", 0)) for i in invoices)
        
        # Get expenses
        receipts = list(db.collection(Collections.RECEIPTS)
                        .where("event_id", "==", eid).stream())
        expenses = sum(float(r.to_dict().get("amount", 0)) for r in receipts)
        
        profit = revenue - expenses
        margin = (profit / revenue * 100) if revenue > 0 else 0
        
        event_analyses.append({
            "event_id": eid,
            "event_name": event.get("name", event.get("title", "Unnamed")),
            "event_type": event.get("event_type", "Unknown"),
            "event_date": event.get("event_date"),
            "revenue": revenue,
            "expenses": expenses,
            "profit": profit,
            "margin_percent": margin
        })
    
    # Calculate aggregates
    total_revenue = sum(e["revenue"] for e in event_analyses)
    total_expenses = sum(e["expenses"] for e in event_analyses)
    total_profit = sum(e["profit"] for e in event_analyses)
    avg_margin = sum(e["margin_percent"] for e in event_analyses) / len(event_analyses) if event_analyses else 0
    
    # AI insights
    try:
        from gemini_client import get_gemini_client
        client = get_gemini_client()
        
        events_summary = "\n".join([
            f"- {e['event_name']} ({e['event_type']}): Revenue ${e['revenue']:,.0f}, Profit ${e['profit']:,.0f} ({e['margin_percent']:.1f}% margin)"
            for e in event_analyses[:10]  # Top 10 for analysis
        ])
        
        prompt = f"""Analyze event profitability:

Events analyzed: {len(event_analyses)}
Total Revenue: ${total_revenue:,.2f}
Total Expenses: ${total_expenses:,.2f}
Total Profit: ${total_profit:,.2f}
Average Margin: {avg_margin:.1f}%

Event Details:
{events_summary}

Provide:
1. Most profitable event types
2. Events with concerning margins
3. Cost optimization opportunities
4. Pricing recommendations
5. Strategic insights

Format as JSON."""

        result = await client.generate_text(prompt=prompt, task_type="financial_analysis")
        
        import json
        try:
            analysis = json.loads(result["text"].strip().replace("```json", "").replace("```", ""))
        except:
            analysis = {"raw_analysis": result["text"]}
        
    except Exception as e:
        analysis = {"error": str(e)}
    
    return {
        "summary": {
            "events_analyzed": len(event_analyses),
            "total_revenue": total_revenue,
            "total_expenses": total_expenses,
            "total_profit": total_profit,
            "average_margin": avg_margin
        },
        "events": event_analyses,
        "ai_analysis": analysis
    }


# ============ CLIENT HEALTH ============

@router.post("/client-health")
async def analyze_client_health(
    org_code: str,
    client_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Analyze client relationship health"""
    db = get_db()
    
    if client_id:
        clients = [{"id": client_id, **db.collection(Collections.CLIENTS).document(client_id).get().to_dict()}]
    else:
        clients = [{"id": d.id, **d.to_dict()} 
                   for d in db.collection(Collections.CLIENTS)
                   .where("org_code", "==", org_code).limit(50).stream()]
    
    client_analyses = []
    
    for client in clients:
        cid = client["id"]
        
        # Total revenue from client
        invoices = list(db.collection(Collections.INVOICES)
                        .where("client_id", "==", cid).stream())
        total_revenue = sum(float(i.to_dict().get("total", 0)) for i in invoices)
        
        # Outstanding balance
        ar_docs = list(db.collection(Collections.AR)
                       .where("client_id", "==", cid)
                       .where("status", "!=", "paid").stream())
        outstanding = sum(float(a.to_dict().get("balance", 0)) for a in ar_docs)
        
        # Overdue amount
        overdue = sum(
            float(a.to_dict().get("balance", 0))
            for a in ar_docs
            if a.to_dict().get("due_date", "") < date.today().isoformat()
        )
        
        # Events count
        events = list(db.collection(Collections.EVENTS)
                      .where("client_id", "==", cid).stream())
        
        # Payment history
        payment_ratio = ((total_revenue - outstanding) / total_revenue * 100) if total_revenue > 0 else 100
        
        client_analyses.append({
            "client_id": cid,
            "client_name": client.get("name", "Unknown"),
            "total_revenue": total_revenue,
            "total_events": len(events),
            "outstanding_balance": outstanding,
            "overdue_amount": overdue,
            "payment_ratio": payment_ratio,
            "health_score": "good" if payment_ratio > 90 and overdue == 0 else "attention" if payment_ratio > 70 else "at_risk"
        })
    
    return {
        "clients_analyzed": len(client_analyses),
        "clients": client_analyses,
        "summary": {
            "total_outstanding": sum(c["outstanding_balance"] for c in client_analyses),
            "total_overdue": sum(c["overdue_amount"] for c in client_analyses),
            "at_risk_clients": len([c for c in client_analyses if c["health_score"] == "at_risk"])
        }
    }
