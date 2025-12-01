"""
Financial Hub router - Dashboard and summary endpoints
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime, date, timedelta
from pydantic import BaseModel
from decimal import Decimal

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.firebase_client import get_db, Collections
from shared.auth import get_current_user
from shared.redis_client import cache


router = APIRouter()


# ============ DASHBOARD ============

@router.get("/dashboard")
@cache(ttl=60)
async def get_financial_dashboard(
    org_code: str,
    period: Optional[str] = None,  # YYYY-MM
    current_user: dict = Depends(get_current_user)
):
    """Get financial dashboard overview"""
    db = get_db()
    
    # Default to current month
    if not period:
        period = date.today().strftime("%Y-%m")
    
    year, month = map(int, period.split("-"))
    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end_date = date(year, month + 1, 1) - timedelta(days=1)
    
    # Calculate AR totals
    ar_docs = db.collection(Collections.AR)\
        .where("org_code", "==", org_code)\
        .where("status", "!=", "paid").stream()
    
    ar_total = 0.0
    ar_overdue = 0.0
    today = date.today().isoformat()
    
    for doc in ar_docs:
        data = doc.to_dict()
        amount = float(data.get("amount", 0))
        ar_total += amount
        if data.get("due_date", "") < today:
            ar_overdue += amount
    
    # Calculate AP totals
    ap_docs = db.collection(Collections.AP)\
        .where("org_code", "==", org_code)\
        .where("status", "!=", "paid").stream()
    
    ap_total = 0.0
    ap_overdue = 0.0
    
    for doc in ap_docs:
        data = doc.to_dict()
        amount = float(data.get("amount", 0))
        ap_total += amount
        if data.get("due_date", "") < today:
            ap_overdue += amount
    
    # Revenue this period
    revenue_docs = db.collection(Collections.INVOICES)\
        .where("org_code", "==", org_code)\
        .where("date", ">=", start_date.isoformat())\
        .where("date", "<=", end_date.isoformat()).stream()
    
    revenue = sum(float(d.to_dict().get("total", 0)) for d in revenue_docs)
    
    # Expenses this period
    expense_docs = db.collection(Collections.RECEIPTS)\
        .where("org_code", "==", org_code)\
        .where("date", ">=", start_date.isoformat())\
        .where("date", "<=", end_date.isoformat()).stream()
    
    expenses = sum(float(d.to_dict().get("amount", 0)) for d in expense_docs)
    
    return {
        "period": period,
        "accounts_receivable": {
            "total": ar_total,
            "overdue": ar_overdue,
            "current": ar_total - ar_overdue
        },
        "accounts_payable": {
            "total": ap_total,
            "overdue": ap_overdue,
            "current": ap_total - ap_overdue
        },
        "period_summary": {
            "revenue": revenue,
            "expenses": expenses,
            "net_income": revenue - expenses
        },
        "cash_position": ar_total - ap_total
    }


@router.get("/summary")
@cache(ttl=120)
async def get_financial_summary(
    org_code: str,
    year: int = None,
    current_user: dict = Depends(get_current_user)
):
    """Get annual financial summary"""
    db = get_db()
    
    if not year:
        year = date.today().year
    
    start_date = f"{year}-01-01"
    end_date = f"{year}-12-31"
    
    # Monthly breakdown
    monthly_data = []
    
    for month in range(1, 13):
        month_start = f"{year}-{month:02d}-01"
        if month == 12:
            month_end = f"{year}-12-31"
        else:
            month_end = f"{year}-{month+1:02d}-01"
        
        # Get invoices for month
        invoices_docs = db.collection(Collections.INVOICES)\
            .where("org_code", "==", org_code)\
            .where("date", ">=", month_start)\
            .where("date", "<", month_end).stream()
        
        revenue = sum(float(d.to_dict().get("total", 0)) for d in invoices_docs)
        
        # Get receipts for month
        receipts_docs = db.collection(Collections.RECEIPTS)\
            .where("org_code", "==", org_code)\
            .where("date", ">=", month_start)\
            .where("date", "<", month_end).stream()
        
        expenses = sum(float(d.to_dict().get("amount", 0)) for d in receipts_docs)
        
        monthly_data.append({
            "month": month,
            "month_name": datetime(year, month, 1).strftime("%B"),
            "revenue": revenue,
            "expenses": expenses,
            "profit": revenue - expenses
        })
    
    # Calculate totals
    total_revenue = sum(m["revenue"] for m in monthly_data)
    total_expenses = sum(m["expenses"] for m in monthly_data)
    
    return {
        "year": year,
        "monthly_breakdown": monthly_data,
        "totals": {
            "revenue": total_revenue,
            "expenses": total_expenses,
            "net_profit": total_revenue - total_expenses,
            "profit_margin": (total_revenue - total_expenses) / total_revenue * 100 if total_revenue > 0 else 0
        }
    }


# ============ REPORTS ============

@router.get("/reports/aging")
@cache(ttl=300)
async def get_aging_report(
    org_code: str,
    report_type: str = "ar",  # ar or ap
    current_user: dict = Depends(get_current_user)
):
    """Get aging report for AR or AP"""
    db = get_db()
    
    collection = Collections.AR if report_type == "ar" else Collections.AP
    
    docs = db.collection(collection)\
        .where("org_code", "==", org_code)\
        .where("status", "!=", "paid").stream()
    
    today = date.today()
    buckets = {
        "current": [],
        "1_30": [],
        "31_60": [],
        "61_90": [],
        "90_plus": []
    }
    
    for doc in docs:
        data = doc.to_dict()
        data["id"] = doc.id
        
        due_date_str = data.get("due_date", today.isoformat())
        due_date = datetime.strptime(due_date_str, "%Y-%m-%d").date()
        days_overdue = (today - due_date).days
        
        if days_overdue <= 0:
            buckets["current"].append(data)
        elif days_overdue <= 30:
            buckets["1_30"].append(data)
        elif days_overdue <= 60:
            buckets["31_60"].append(data)
        elif days_overdue <= 90:
            buckets["61_90"].append(data)
        else:
            buckets["90_plus"].append(data)
    
    # Calculate totals
    summary = {
        "current": sum(float(d.get("amount", 0)) for d in buckets["current"]),
        "1_30": sum(float(d.get("amount", 0)) for d in buckets["1_30"]),
        "31_60": sum(float(d.get("amount", 0)) for d in buckets["31_60"]),
        "61_90": sum(float(d.get("amount", 0)) for d in buckets["61_90"]),
        "90_plus": sum(float(d.get("amount", 0)) for d in buckets["90_plus"])
    }
    
    summary["total"] = sum(summary.values())
    
    return {
        "report_type": report_type,
        "as_of": today.isoformat(),
        "summary": summary,
        "details": buckets
    }


@router.get("/reports/cashflow")
@cache(ttl=300)
async def get_cashflow_report(
    org_code: str,
    start_date: str,
    end_date: str,
    current_user: dict = Depends(get_current_user)
):
    """Get cash flow report"""
    db = get_db()
    
    # Cash inflows (paid invoices)
    inflow_docs = db.collection(Collections.AR)\
        .where("org_code", "==", org_code)\
        .where("status", "==", "paid")\
        .where("paid_date", ">=", start_date)\
        .where("paid_date", "<=", end_date).stream()
    
    inflows = []
    total_inflow = 0.0
    
    for doc in inflow_docs:
        data = doc.to_dict()
        amount = float(data.get("amount", 0))
        total_inflow += amount
        inflows.append({
            "id": doc.id,
            "date": data.get("paid_date"),
            "description": data.get("description", ""),
            "amount": amount,
            "client": data.get("client_name", "")
        })
    
    # Cash outflows (paid expenses)
    outflow_docs = db.collection(Collections.AP)\
        .where("org_code", "==", org_code)\
        .where("status", "==", "paid")\
        .where("paid_date", ">=", start_date)\
        .where("paid_date", "<=", end_date).stream()
    
    outflows = []
    total_outflow = 0.0
    
    for doc in outflow_docs:
        data = doc.to_dict()
        amount = float(data.get("amount", 0))
        total_outflow += amount
        outflows.append({
            "id": doc.id,
            "date": data.get("paid_date"),
            "description": data.get("description", ""),
            "amount": amount,
            "vendor": data.get("vendor_name", "")
        })
    
    return {
        "period": {"start": start_date, "end": end_date},
        "inflows": {
            "transactions": inflows,
            "total": total_inflow
        },
        "outflows": {
            "transactions": outflows,
            "total": total_outflow
        },
        "net_cashflow": total_inflow - total_outflow
    }


@router.get("/reports/profit-loss")
@cache(ttl=300)
async def get_profit_loss_report(
    org_code: str,
    start_date: str,
    end_date: str,
    current_user: dict = Depends(get_current_user)
):
    """Get profit and loss report"""
    db = get_db()
    
    # Revenue by category
    revenue_docs = db.collection(Collections.INVOICES)\
        .where("org_code", "==", org_code)\
        .where("date", ">=", start_date)\
        .where("date", "<=", end_date).stream()
    
    revenue_by_category = {}
    total_revenue = 0.0
    
    for doc in revenue_docs:
        data = doc.to_dict()
        category = data.get("category", "Uncategorized")
        amount = float(data.get("total", 0))
        
        if category not in revenue_by_category:
            revenue_by_category[category] = 0.0
        revenue_by_category[category] += amount
        total_revenue += amount
    
    # Expenses by category
    expense_docs = db.collection(Collections.RECEIPTS)\
        .where("org_code", "==", org_code)\
        .where("date", ">=", start_date)\
        .where("date", "<=", end_date).stream()
    
    expenses_by_category = {}
    total_expenses = 0.0
    
    for doc in expense_docs:
        data = doc.to_dict()
        category = data.get("category", "Uncategorized")
        amount = float(data.get("amount", 0))
        
        if category not in expenses_by_category:
            expenses_by_category[category] = 0.0
        expenses_by_category[category] += amount
        total_expenses += amount
    
    gross_profit = total_revenue - total_expenses
    
    return {
        "period": {"start": start_date, "end": end_date},
        "revenue": {
            "by_category": revenue_by_category,
            "total": total_revenue
        },
        "expenses": {
            "by_category": expenses_by_category,
            "total": total_expenses
        },
        "gross_profit": gross_profit,
        "profit_margin_percent": (gross_profit / total_revenue * 100) if total_revenue > 0 else 0
    }


# ============ TEAM MEMBER FINANCIAL SUMMARY ============

@router.get("/member/{member_id}/summary")
async def get_member_financial_summary(
    member_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get financial summary for a team member.
    Returns total earnings, pending payouts, last payout, and recent transactions.
    Admin only.
    """
    db = get_db()
    org_id = current_user.get("orgId")
    role = current_user.get("role", "").lower()
    
    # Only admins and accountants can view member financial data
    if role not in ["admin", "accountant"]:
        raise HTTPException(status_code=403, detail="Not authorized to view member financial data")
    
    try:
        # Get salary profile for this member
        salary_profiles = db.collection("organizations").document(org_id)\
            .collection("salaryProfiles").where("userId", "==", member_id).limit(1).stream()
        
        salary_profile = None
        for doc in salary_profiles:
            salary_profile = {"id": doc.id, **doc.to_dict()}
            break
        
        # Get all payslips for this member
        payslips_ref = db.collection("organizations").document(org_id)\
            .collection("payslips").where("userId", "==", member_id)\
            .order_by("createdAt", direction="DESCENDING").stream()
        
        payslips = []
        total_earnings = 0.0
        pending_payout = 0.0
        last_payout = 0.0
        recent_transactions = []
        
        for doc in payslips_ref:
            data = doc.to_dict()
            payslips.append({"id": doc.id, **data})
            
            net_pay = float(data.get("netPay", 0))
            status = data.get("status", "").upper()
            
            if status == "PAID":
                total_earnings += net_pay
                # Track last payout
                if len([p for p in payslips if p.get("status", "").upper() == "PAID"]) == 1:
                    last_payout = net_pay
            elif status in ["PUBLISHED", "DRAFT"]:
                pending_payout += net_pay
            
            # Add to recent transactions
            period = data.get("period", {})
            month = period.get("month", 1)
            year = period.get("year", 2024)
            
            recent_transactions.append({
                "date": f"{year}-{month:02d}-01",
                "description": f"Salary - {period.get('month', 'N/A')}/{period.get('year', 'N/A')}",
                "type": "credit" if status == "PAID" else "pending",
                "amount": net_pay,
                "status": status
            })
        
        # Get adjustments/bonuses for this member
        adjustments_ref = db.collection("organizations").document(org_id)\
            .collection("adjustments").where("memberId", "==", member_id).stream()
        
        for doc in adjustments_ref:
            data = doc.to_dict()
            amount = float(data.get("amount", 0))
            adj_type = data.get("type", "bonus")
            
            if adj_type.lower() in ["bonus", "reimbursement", "credit"]:
                total_earnings += amount
                tx_type = "credit"
            else:
                tx_type = "debit"
            
            recent_transactions.append({
                "date": data.get("date", data.get("createdAt", "")),
                "description": data.get("description", adj_type.title()),
                "type": tx_type,
                "amount": amount
            })
        
        # Sort transactions by date descending and limit to 10
        recent_transactions.sort(key=lambda x: x.get("date", ""), reverse=True)
        recent_transactions = recent_transactions[:10]
        
        # Format dates for display
        for tx in recent_transactions:
            if tx.get("date"):
                try:
                    # Handle various date formats
                    date_str = tx["date"]
                    if "T" in date_str:
                        date_str = date_str.split("T")[0]
                    from datetime import datetime
                    dt = datetime.strptime(date_str[:10], "%Y-%m-%d")
                    tx["date"] = dt.strftime("%d %b %Y")
                except:
                    pass
        
        return {
            "memberId": member_id,
            "totalEarnings": total_earnings,
            "pendingPayout": pending_payout,
            "lastPayout": last_payout,
            "recentTransactions": recent_transactions,
            "salaryProfile": {
                "baseSalary": salary_profile.get("baseSalary", 0) if salary_profile else 0,
                "frequency": salary_profile.get("frequency", "monthly") if salary_profile else "monthly"
            } if salary_profile else None
        }
        
    except Exception as e:
        # Return empty data on error rather than breaking the page
        return {
            "memberId": member_id,
            "totalEarnings": 0,
            "pendingPayout": 0,
            "lastPayout": 0,
            "recentTransactions": [],
            "salaryProfile": None,
            "error": str(e)
        }
