"""
Budgets router - Budget planning and tracking
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime, date
from pydantic import BaseModel

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.firebase_client import get_db, Collections
from shared.auth import get_current_user
from shared.redis_client import cache


router = APIRouter()


# ============ SCHEMAS ============

class BudgetLineItem(BaseModel):
    category: str
    description: Optional[str] = None
    amount: float


class BudgetCreate(BaseModel):
    name: str
    period_type: str  # monthly, quarterly, annual, project
    start_date: str
    end_date: str
    event_id: Optional[str] = None
    project_id: Optional[str] = None
    line_items: List[BudgetLineItem]
    notes: Optional[str] = None


class BudgetUpdate(BaseModel):
    name: Optional[str] = None
    line_items: Optional[List[BudgetLineItem]] = None
    notes: Optional[str] = None
    status: Optional[str] = None


# ============ BUDGETS ============

@router.get("/")
@cache(ttl=120)
async def get_budgets(
    org_code: str,
    period_type: Optional[str] = None,
    status: Optional[str] = None,
    event_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get budgets"""
    db = get_db()
    
    query = db.collection(Collections.BUDGETS).where("org_code", "==", org_code)
    
    if period_type:
        query = query.where("period_type", "==", period_type)
    
    if status:
        query = query.where("status", "==", status)
    
    if event_id:
        query = query.where("event_id", "==", event_id)
    
    docs = query.stream()
    budgets = []
    
    for doc in docs:
        budget = doc.to_dict()
        budget["id"] = doc.id
        budgets.append(budget)
    
    return {"budgets": budgets, "count": len(budgets)}


@router.post("/")
async def create_budget(
    budget: BudgetCreate,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Create a new budget"""
    db = get_db()
    
    # Calculate total
    total = sum(item.amount for item in budget.line_items)
    
    budget_data = budget.dict()
    budget_data["org_code"] = org_code
    budget_data["total_budget"] = total
    budget_data["total_spent"] = 0.0
    budget_data["remaining"] = total
    budget_data["percent_used"] = 0.0
    budget_data["created_at"] = datetime.utcnow().isoformat()
    budget_data["created_by"] = current_user["user_id"]
    budget_data["status"] = "active"
    
    # Add tracking to each line item
    for item in budget_data["line_items"]:
        item["spent"] = 0.0
        item["remaining"] = item["amount"]
    
    doc_ref = db.collection(Collections.BUDGETS).document()
    doc_ref.set(budget_data)
    
    return {"id": doc_ref.id, "message": "Budget created", "total": total}


@router.get("/{budget_id}")
async def get_budget(
    budget_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific budget with spending details"""
    db = get_db()
    doc = db.collection(Collections.BUDGETS).document(budget_id).get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Budget not found")
    
    budget = doc.to_dict()
    budget["id"] = doc.id
    
    # Get actual spending from receipts
    start_date = budget.get("start_date")
    end_date = budget.get("end_date")
    org_code = budget.get("org_code")
    
    receipts = db.collection(Collections.RECEIPTS)\
        .where("org_code", "==", org_code)\
        .where("date", ">=", start_date)\
        .where("date", "<=", end_date).stream()
    
    spending_by_category = {}
    
    for receipt in receipts:
        data = receipt.to_dict()
        category = data.get("category", "Other")
        amount = float(data.get("amount", 0))
        
        if category not in spending_by_category:
            spending_by_category[category] = 0.0
        spending_by_category[category] += amount
    
    # Update line items with actual spending
    total_spent = 0.0
    for item in budget.get("line_items", []):
        category = item.get("category")
        spent = spending_by_category.get(category, 0.0)
        item["spent"] = spent
        item["remaining"] = item["amount"] - spent
        item["percent_used"] = (spent / item["amount"] * 100) if item["amount"] > 0 else 0
        total_spent += spent
    
    budget["total_spent"] = total_spent
    budget["remaining"] = budget.get("total_budget", 0) - total_spent
    budget["percent_used"] = (total_spent / budget.get("total_budget", 1)) * 100
    
    return budget


@router.patch("/{budget_id}")
async def update_budget(
    budget_id: str,
    update: BudgetUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a budget"""
    db = get_db()
    doc_ref = db.collection(Collections.BUDGETS).document(budget_id)
    
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Budget not found")
    
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    
    # Recalculate total if line items changed
    if update.line_items:
        total = sum(item.amount for item in update.line_items)
        update_data["total_budget"] = total
        
        # Add tracking to each line item
        line_items = [item.dict() for item in update.line_items]
        for item in line_items:
            item["spent"] = 0.0
            item["remaining"] = item["amount"]
        update_data["line_items"] = line_items
    
    update_data["updated_at"] = datetime.utcnow().isoformat()
    update_data["updated_by"] = current_user["user_id"]
    
    doc_ref.update(update_data)
    
    return {"message": "Budget updated"}


@router.delete("/{budget_id}")
async def delete_budget(
    budget_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a budget"""
    db = get_db()
    doc_ref = db.collection(Collections.BUDGETS).document(budget_id)
    
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Budget not found")
    
    doc_ref.delete()
    
    return {"message": "Budget deleted"}


# ============ VARIANCE ANALYSIS ============

@router.get("/{budget_id}/variance")
@cache(ttl=60)
async def get_budget_variance(
    budget_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get budget variance analysis"""
    db = get_db()
    doc = db.collection(Collections.BUDGETS).document(budget_id).get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Budget not found")
    
    budget = doc.to_dict()
    
    # Get actual spending
    start_date = budget.get("start_date")
    end_date = budget.get("end_date")
    org_code = budget.get("org_code")
    
    receipts = db.collection(Collections.RECEIPTS)\
        .where("org_code", "==", org_code)\
        .where("date", ">=", start_date)\
        .where("date", "<=", end_date).stream()
    
    spending_by_category = {}
    
    for receipt in receipts:
        data = receipt.to_dict()
        category = data.get("category", "Other")
        amount = float(data.get("amount", 0))
        
        if category not in spending_by_category:
            spending_by_category[category] = 0.0
        spending_by_category[category] += amount
    
    # Calculate variances
    variances = []
    total_budget = 0.0
    total_actual = 0.0
    
    for item in budget.get("line_items", []):
        category = item.get("category")
        budgeted = item.get("amount", 0)
        actual = spending_by_category.get(category, 0.0)
        variance = budgeted - actual
        
        variances.append({
            "category": category,
            "budgeted": budgeted,
            "actual": actual,
            "variance": variance,
            "variance_percent": (variance / budgeted * 100) if budgeted > 0 else 0,
            "status": "under" if variance >= 0 else "over"
        })
        
        total_budget += budgeted
        total_actual += actual
    
    return {
        "budget_id": budget_id,
        "budget_name": budget.get("name"),
        "period": {
            "start": start_date,
            "end": end_date
        },
        "line_variances": variances,
        "summary": {
            "total_budgeted": total_budget,
            "total_actual": total_actual,
            "total_variance": total_budget - total_actual,
            "variance_percent": ((total_budget - total_actual) / total_budget * 100) if total_budget > 0 else 0
        }
    }


# ============ TEMPLATES ============

@router.get("/templates")
async def get_budget_templates():
    """Get standard budget templates"""
    return {
        "templates": {
            "wedding": [
                {"category": "Venue", "percent": 25},
                {"category": "Catering", "percent": 20},
                {"category": "Photography", "percent": 15},
                {"category": "Videography", "percent": 15},
                {"category": "Decor", "percent": 10},
                {"category": "Music", "percent": 5},
                {"category": "Attire", "percent": 5},
                {"category": "Misc", "percent": 5}
            ],
            "corporate_event": [
                {"category": "Venue", "percent": 30},
                {"category": "AV Equipment", "percent": 20},
                {"category": "Catering", "percent": 25},
                {"category": "Marketing", "percent": 10},
                {"category": "Staff", "percent": 10},
                {"category": "Misc", "percent": 5}
            ],
            "monthly_operations": [
                {"category": "Rent", "percent": 25},
                {"category": "Salaries", "percent": 40},
                {"category": "Equipment", "percent": 15},
                {"category": "Marketing", "percent": 10},
                {"category": "Utilities", "percent": 5},
                {"category": "Misc", "percent": 5}
            ]
        }
    }


@router.post("/from-template")
async def create_budget_from_template(
    template_type: str,
    total_amount: float,
    name: str,
    start_date: str,
    end_date: str,
    org_code: str,
    event_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Create a budget from a template"""
    db = get_db()
    
    templates = (await get_budget_templates())["templates"]
    template = templates.get(template_type)
    
    if not template:
        raise HTTPException(status_code=400, detail=f"Template '{template_type}' not found")
    
    line_items = []
    for item in template:
        amount = total_amount * (item["percent"] / 100)
        line_items.append({
            "category": item["category"],
            "amount": amount,
            "spent": 0.0,
            "remaining": amount
        })
    
    budget_data = {
        "name": name,
        "org_code": org_code,
        "period_type": "project" if event_id else "custom",
        "start_date": start_date,
        "end_date": end_date,
        "event_id": event_id,
        "line_items": line_items,
        "total_budget": total_amount,
        "total_spent": 0.0,
        "remaining": total_amount,
        "percent_used": 0.0,
        "created_at": datetime.utcnow().isoformat(),
        "created_by": current_user["user_id"],
        "status": "active",
        "template_used": template_type
    }
    
    doc_ref = db.collection(Collections.BUDGETS).document()
    doc_ref.set(budget_data)
    
    return {"id": doc_ref.id, "message": "Budget created from template"}
